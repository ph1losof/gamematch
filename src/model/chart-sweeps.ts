/**
 * The sweeps behind the dashboard's charts: profit over the bids we could pay (and the best one),
 * profit over a CTR × follow-on grid, and the tornado of one-input-at-a-time swings. They shape the
 * charts and the best-bid search, never the verdict or the test sizing, so their grids are fixed
 * here rather than params.
 */
import { type Micros, usd } from '../shared/money';
import type { Platform } from '../shared/types';
import { platformCore } from './blend';
import { impressionsPerReachedUser, medianClearing, winAt } from './delivery';
import type { BidPoint, Heatmap, OptimalBid, Scenario, Tornado, Variant } from './scenario-types';
import { argmaxOnGrid, linspace, tornadoOrder } from './sweeps';

/** Display-only grids: [from, to, points]. The bid search runs up to the largest multiple. */
const GRID = {
  heatmapCtr: [0.005, 0.08, 16],
  heatmapFollowOn: [0, usd(40), 21],
  bidCurvePoints: 121,
  bidCeiling: { value: 2, price: 2, median: 3 },
} as const;

/** What one bid does for the whole campaign, given the value per 1,000 users see. */
export type BidSweepInput = {
  reached: number; // users the campaign reaches
  userValue1000: Micros; // value per 1,000 impressions, averaged over users (one bid serves all)
  userIncremental1000: number; // incremental installs per 1,000 impressions, the same way
  price: Micros; // what we pay today
};

export type BidSweep = { curve: BidPoint[]; optimal: OptimalBid };

/** Profit at each bid from 0 to well past both the value and the market, and the best bid. */
export function bidSweep(s: Scenario, p: Platform, x: BidSweepInput): BidSweep {
  const point = (bid: Micros): BidPoint => {
    const win = winAt(s, p, bid);
    return {
      bid,
      winRate: win,
      profit1000: x.userValue1000 - bid,
      campaignProfit:
        (x.reached * impressionsPerReachedUser(s, win) * (x.userValue1000 - bid)) / 1000,
    };
  };
  const ceiling = Math.max(
    GRID.bidCeiling.value * x.userValue1000,
    GRID.bidCeiling.price * x.price,
    GRID.bidCeiling.median * medianClearing(s, p),
  );
  const best = point(argmaxOnGrid((b) => point(b).campaignProfit, 0, ceiling).x);
  const activations =
    (x.reached * impressionsPerReachedUser(s, best.winRate) * x.userIncremental1000) / 1000;
  return {
    curve: linspace(0, ceiling, GRID.bidCurvePoints).map((b) => point(b)),
    optimal: { ...best, activations },
  };
}

/** `s` with platform p's base CTR replaced (a heatmap row). */
const withCtr = (s: Scenario, p: Platform, ctr: number): Scenario => ({
  ...s,
  funnel: { ...s.funnel, [p]: { ...s.funnel[p], ctr } },
});

/** Profit per 1,000 over base CTR (rows) × follow-on value (columns), and where today sits. */
export function profitHeatmap(s: Scenario, p: Platform, followOnNow: Micros): Heatmap {
  const ctrs = linspace(...GRID.heatmapCtr);
  const followOns = linspace(...GRID.heatmapFollowOn);
  const cells = ctrs.flatMap((ctr, i) =>
    followOns.map((fo, j): [number, number, Micros] => [
      i,
      j,
      platformCore(withCtr(s, p, ctr), p, fo).profit1000,
    ]),
  );
  return { ctrs, followOns, cells, current: { ctr: s.funnel[p].ctr, followOn: followOnNow } };
}

/** Profit per 1,000 at each variant's low and high scenario, ordered by swing. */
export function tornado(p: Platform, base: Micros, variants: Variant[]): Tornado {
  const bars = tornadoOrder(
    base,
    variants.map((v) => ({
      key: v.key,
      label: v.label,
      lowText: v.lowText,
      highText: v.highText,
      low: platformCore(v.low, p).profit1000,
      high: platformCore(v.high, p).profit1000,
    })),
  );
  return { base, bars };
}
