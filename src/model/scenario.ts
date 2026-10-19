/**
 * The whole business case as one pure function: Scenario in, Outputs out. The dashboard converts
 * its controls into a Scenario (model units: fractions and micros), calls evaluate() and renders
 * only what comes back, so every number on screen is computed by the same bidding functions the
 * backend uses.
 *
 * How evaluate() composes the parts, in order:
 * 1. population.ts: the pool, from 1M linked users through each gate to who can be enrolled and
 *    who a campaign reaches.
 * 2. platform.ts, per platform: cells (cell.ts, one per segment) blended by impressions
 *    (blend.ts) into value, price and profit per 1,000 impressions, the break-even levers, the
 *    chart sweeps and the verdict.
 * 3. experiment-sizing.ts: what the budget buys in the holdout test and what it can detect.
 * 4. prize.ts: the enrollable pool treated for one test-length wave.
 * The shapes live in scenario-types.ts.
 */
import { marginPerInstall } from './bidding';
import { offerGoals } from './cell';
import { experimentSizing } from './experiment-sizing';
import { issuesFor } from './issues';
import { platformResult } from './platform';
import { eligiblePool, geoShares } from './population';
import { prizeFor } from './prize';
import { byPlatform } from './records';
import type { Outputs, Scenario, Variant } from './scenario-types';
import { SEGMENTS } from './segments';
import { overallVerdict } from './verdict';

export function evaluate(s: Scenario, variants: Variant[] = []): Outputs {
  const geo = geoShares(s.population);
  const pool = eligiblePool(
    s.population,
    s.segments.share,
    s.segments.target,
    s.valueTier.highOnly ? s.valueTier.share : undefined,
  );
  const platforms = byPlatform((p) => platformResult(s, p, pool, variants));
  const goals = offerGoals(s.offer).map((g) => g.economics);
  const paid = goals.reduce((a, g) => a + g.completionRate * g.payout, 0);
  const rewarded = goals.reduce((a, g) => a + g.completionRate * g.reward, 0);
  const d = s.segments.days;
  return {
    issues: issuesFor(s, geo.valid),
    geo: geo.shares,
    segmentLabels: {
      hot: `Hot (≤${d.hot} d)`,
      warm: `Warm (≤${d.warm} d)`,
      cold: `Cold (>${d.warm} d)`,
    },
    targeted: SEGMENTS.filter((k) => s.segments.target[k]),
    offer: {
      marginPerInstall: marginPerInstall(goals),
      userShare: paid > 0 ? rewarded / paid : 0,
      goals,
    },
    pool: pool.steps,
    platforms,
    sizing: experimentSizing(s, platforms),
    prize: prizeFor(platforms),
    verdict: overallVerdict(platforms),
  };
}
