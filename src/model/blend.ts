/**
 * A platform's figures blend its targeted segments' cells. Each segment weighs by its share of
 * targeted users × the impressions it is delivered, so the blended price is the one price every
 * break-even figure is measured against, in either buy mode. platformCore is the cheap part that
 * the tornado and heatmap rerun many times; followOnToReach solves for the follow-on value that
 * lifts the blend to a target value.
 */
import type { Micros } from '../shared/money';
import type { Platform } from '../shared/types';
import { creditedMargin } from './bidding';
import { cellFor, type OfferGoal, offerGoals } from './cell';
import type { GoalEconomics } from './goals';
import { byPlatform, bySegment, sumSegments } from './records';
import type { Cell, Scenario } from './scenario-types';
import { SEGMENTS, type Segment } from './segments';

/** Most re-blends when solving for a follow-on value in CPA mode; it settles in two or three. */
const SETTLE_STEPS = 10;

export type PlatformCore = {
  slots: OfferGoal[];
  goals: GoalEconomics[];
  /** Targeted segments by share of users (sums to 1). */
  userWeights: Record<Segment, number>;
  /** Targeted segments by share of impressions delivered (sums to 1). */
  impressionWeights: Record<Segment, number>;
  cells: Record<Segment, Cell>;
  value1000: Micros;
  bid: Micros;
  profit1000: Micros;
  incremental1000: number;
  /** Credited margin per incremental install: the same in every segment. */
  margin: Micros;
  /** Follow-on value per incremental install, so margin + follow-on = value per incremental install. */
  followOnNow: Micros;
};

/** Targeted segments by user share, normalised; all segments if none is targeted. */
function userWeightsOf(s: Scenario): Record<Segment, number> {
  const any = SEGMENTS.some((k) => s.segments.target[k]);
  const raw = bySegment((k) =>
    s.segments.target[k] || !any ? Math.max(0, s.segments.share[k]) : 0,
  );
  const sum = sumSegments((k) => raw[k]);
  return bySegment((k) => (sum > 0 ? raw[k] / sum : 1 / SEGMENTS.length));
}

/** Σ weight × f(cell) over the segments. */
export const weighted = (
  weights: Record<Segment, number>,
  cells: Record<Segment, Cell>,
  f: (c: Cell) => number,
): number => sumSegments((k) => weights[k] * f(cells[k]));

/** Cells and impression-weighted blend for one platform. `followOn` overrides every segment's. */
export function platformCore(s: Scenario, p: Platform, followOn?: Micros): PlatformCore {
  const slots = offerGoals(s.offer);
  const goals = slots.map((g) => g.economics);
  const userWeights = userWeightsOf(s);
  const cells = bySegment((k) => cellFor(s, p, k, goals, followOn));
  const delivered = bySegment((k) => userWeights[k] * cells[k].impressionsPerReachedUser);
  const deliveredSum = sumSegments((k) => delivered[k]);
  const impressionWeights =
    deliveredSum > 0 ? bySegment((k) => delivered[k] / deliveredSum) : userWeights;
  const blend = (f: (c: Cell) => number) => weighted(impressionWeights, cells, f);
  const value1000 = blend((c) => c.value1000);
  // In CPM mode every segment pays the same price; keep it exact rather than a float blend.
  const bid = s.market.buyMode === 'cpm' ? s.market.cpm[p] : blend((c) => c.bid);
  const incremental1000 = blend((c) => c.funnel1000.incremental);
  // Lifts never touch credit, eligibility or payouts, so every segment earns the same per install.
  const margin = creditedMargin(cells.warm.funnel, goals);
  const followOnNow =
    incremental1000 > 0
      ? blend((c) => c.funnel1000.incremental * c.funnel.followOnValue) / incremental1000
      : 0;
  return {
    slots,
    goals,
    userWeights,
    impressionWeights,
    cells,
    value1000,
    bid,
    profit1000: value1000 - bid,
    incremental1000,
    margin,
    followOnNow,
  };
}

/** Blended profit per 1,000 impressions per platform. */
export const profitPer1000 = (s: Scenario): Record<Platform, Micros> =>
  byPlatform((p) => platformCore(s, p).profit1000);

/**
 * Follow-on value per activated user at which this blend's value per 1,000 reaches `target1000`.
 * Value is incremental installs × (credited margin + follow-on), so for fixed segment weights it's
 * one step.
 */
export const followOnStep = (core: PlatformCore, target1000: Micros): Micros =>
  target1000 / core.incremental1000 - core.margin;

/**
 * The same, letting the weights move: in CPA mode each segment's bid, and so its share of
 * impressions, rises with its value, so one step can fall short. Re-blend at the answer until it
 * settles (to within a micro).
 */
export function followOnToReach(s: Scenario, p: Platform, target1000: Micros): Micros {
  let followOn = followOnStep(platformCore(s, p), target1000);
  for (
    let i = 0;
    s.market.buyMode === 'cpa' && Number.isFinite(followOn) && i < SETTLE_STEPS;
    i++
  ) {
    const next = followOnStep(platformCore(s, p, followOn), target1000);
    if (Math.abs(next - followOn) < 1) return next;
    followOn = next;
  }
  return followOn;
}
