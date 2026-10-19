/**
 * Everything the dashboard shows for one platform, composed from the segment blend: unit economics
 * per 1,000 impressions, what a treated user costs and earns over the test, the break-even levers,
 * the chart sweeps and the verdict.
 */
import type { Micros } from '../shared/money';
import type { Platform } from '../shared/types';
import { creditedMargin, floorCpm } from './bidding';
import { followOnStep, followOnToReach, type PlatformCore, platformCore, weighted } from './blend';
import { bidSweep, profitHeatmap, tornado } from './chart-sweeps';
import type { Pool } from './population';
import { sumSegments } from './records';
import type {
  Cell,
  Ladder,
  PerTreatedUser,
  PlatformResult,
  Scenario,
  Variant,
} from './scenario-types';
import { platformVerdict } from './verdict';

/**
 * Spend, value and activations per treated user: a treated user is reached with probability list
 * reach, and then sees the cell's impressions over the test.
 */
function perTreatedUser(s: Scenario, p: Platform, core: PlatformCore): PerTreatedUser {
  const perUser = (f: (c: Cell) => number) =>
    s.population.listReach[p] *
    sumSegments(
      (k) => core.userWeights[k] * core.cells[k].impressionsPerReachedUser * f(core.cells[k]),
    );
  const spend = perUser((c) => c.bid / 1000);
  const value = perUser((c) => c.value1000 / 1000);
  return {
    spend,
    value,
    profit: value - spend,
    activations: perUser((c) => c.funnel1000.incremental / 1000),
  };
}

/** Per incremental install: what each goal brings, the follow-on counted, and what the price needs. */
const ladderOf = (core: PlatformCore): Ladder => ({
  goals: core.slots.map((g) => ({
    label: g.label,
    value: creditedMargin(core.cells.warm.funnel, [g.economics]),
  })),
  followOn: core.followOnNow,
  needed: core.bid / core.incremental1000,
});

export function platformResult(
  s: Scenario,
  p: Platform,
  pool: Pool,
  variants: Variant[],
): PlatformResult {
  const core = platformCore(s, p);
  const { cells, bid } = core;
  const blend = (f: (c: Cell) => number) => weighted(core.impressionWeights, cells, f);
  const winRateAtBid = blend((c) => c.winRateAtBid);
  // One bid serves every targeted segment, so the bid sweep averages value over users.
  const userValue1000 = weighted(core.userWeights, cells, (c) => c.value1000);
  const sweep = bidSweep(s, p, {
    reached: pool.reached[p],
    userValue1000,
    userIncremental1000: weighted(core.userWeights, cells, (c) => c.funnel1000.incremental),
    price: bid,
  });
  return {
    platform: p,
    cells,
    value1000: core.value1000,
    bid,
    profit1000: core.profit1000,
    maxCpm: floorCpm(userValue1000 * (1 - s.market.targetMargin)),
    winRateAtBid,
    // Both at today's price and blend.
    breakEvenCtr: (s.funnel[p].ctr * bid) / core.value1000,
    breakEvenFollowOn: followOnStep(core, bid),
    funnel1000: {
      impressions: 1000,
      clicks: blend((c) => c.funnel1000.clicks),
      starts: blend((c) => c.funnel1000.starts),
      installs: blend((c) => c.funnel1000.installs),
      incremental: core.incremental1000,
      credited: blend((c) => c.funnel1000.credited),
    },
    enrollable: pool.enrollable[p],
    reached: pool.reached[p],
    perTreatedUser: perTreatedUser(s, p, core),
    bidCurve: sweep.curve,
    optimal: sweep.optimal,
    heatmap: profitHeatmap(s, p, core.followOnNow),
    ladder: ladderOf(core),
    tornado: tornado(p, core.profit1000, variants),
    verdict: platformVerdict(s, p, {
      value1000: core.value1000,
      bid,
      winRate: winRateAtBid,
      ctr: s.funnel[p].ctr,
      followOnToReach: (target: Micros) => followOnToReach(s, p, target),
    }),
  };
}
