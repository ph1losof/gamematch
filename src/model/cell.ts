/**
 * One cell is one platform × segment, the unit every figure is built from. Its funnel is the
 * platform's rates with the offer's eligibility, the region's payouts and the segment's follow-on
 * value for the chosen horizon, then the high-value tier's lifts (when only that tier is targeted)
 * and the segment's. From that funnel: value per 1,000 impressions, the price paid for them in the
 * chosen buying mode, the win rate that price buys, and the funnel counted per 1,000 impressions.
 */
import type { Micros } from '../shared/money';
import type { Platform } from '../shared/types';
import {
  creditedMargin,
  incrementalInstallsPerImpression,
  maxCpa,
  valuePerImpression,
} from './bidding';
import { impressionsPerReachedUser, winAt } from './delivery';
import type { Funnel } from './funnel';
import type { GoalEconomics } from './goals';
import type { Cell, Scenario } from './scenario-types';
import { type Segment, segmentFunnel, tierFunnel } from './segments';

/** An enabled goal of the offer: its label, and its economics as the model prices them. */
export type OfferGoal = { label: string; economics: GoalEconomics };

/**
 * The offer's enabled goals, each completion rate × the completion scale (capped at 100%), and each
 * reward either the goal's own or payout × user share.
 */
export const offerGoals = (o: Scenario['offer']): OfferGoal[] =>
  o.goals.flatMap((g) =>
    g.enabled
      ? [
          {
            label: g.label,
            economics: {
              payout: g.payout,
              reward: o.rewardsFromShare ? Math.round(g.payout * o.userShare) : g.reward,
              completionRate: Math.min(1, g.completionRate * o.completionScale),
            },
          },
        ]
      : [],
  );

/** Follow-on value per activated user of this segment at the chosen horizon (0 for none). */
const followOnValue = (s: Scenario, seg: Segment): Micros =>
  s.followOn.horizon === 'none' ? 0 : s.followOn.value[s.followOn.horizon][seg];

/** The cell's funnel: platform rates, offer eligibility, region payouts, then tier and segment lifts. */
function cellFunnel(s: Scenario, p: Platform, seg: Segment): Funnel {
  const payouts = s.market.region === 'eu' ? s.market.euPayout : 1;
  const base: Funnel = {
    ...s.funnel[p],
    eligibility: s.offer.eligibility,
    marginMultiplier: payouts,
    followOnValue: followOnValue(s, seg),
  };
  return segmentFunnel(
    s.valueTier.highOnly ? tierFunnel(base, s.valueTier.lift) : base,
    s.segments.lift[seg],
  );
}

/** What 1,000 impressions cost in each buying mode. */
function price1000(s: Scenario, p: Platform, f: Funnel, goals: GoalEconomics[]): Micros {
  const m = s.market;
  if (m.buyMode === 'cpm') return m.cpm[p];
  const starts = 1000 * f.ctr * f.startRate;
  if (m.buyMode === 'cpa')
    return starts * (m.cpaAuto ? maxCpa(f, goals, m.targetMargin) : m.cpa[p]);
  // Revenue share: the host studio gets its share of the net margin of every credited install,
  // incremental or not (attribution can't tell them apart).
  return starts * f.installRate * creditedMargin(f, goals) * m.revShare;
}

/** `followOn` overrides the segment's follow-on value (a heatmap column, or a value being solved for). */
export function cellFor(
  s: Scenario,
  p: Platform,
  seg: Segment,
  goals: GoalEconomics[],
  followOn?: Micros,
): Cell {
  const lifted = cellFunnel(s, p, seg);
  const f = followOn === undefined ? lifted : { ...lifted, followOnValue: followOn };
  const value1000 = 1000 * valuePerImpression(f, goals);
  const bid = price1000(s, p, f, goals);
  const winRateAtBid = winAt(s, p, bid);
  const clicks = 1000 * f.ctr;
  const starts = clicks * f.startRate;
  const incremental = 1000 * incrementalInstallsPerImpression(f);
  return {
    platform: p,
    segment: seg,
    funnel: f,
    value1000,
    bid,
    profit1000: value1000 - bid,
    winRateAtBid,
    impressionsPerReachedUser: impressionsPerReachedUser(s, winRateAtBid),
    funnel1000: {
      impressions: 1000,
      clicks,
      starts,
      installs: starts * f.installRate,
      incremental,
      credited: incremental * f.attributedRate * f.eligibility,
    },
  };
}
