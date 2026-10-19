/**
 * Segments are Freecash's edge over a generic advertiser: it knows when each linked user last
 * made progress in their linked game (from Link postbacks), and how much they have earned on Link.
 * Recent players click more but would more often have tried a second game anyway; lapsed players
 * click less but the ad moves them more. High past earners respond more and go deeper into a ladder.
 * The lifts are our estimates from public experiments until the test measures them per segment:
 * Hillstrom's e-mail test (https://blog.minethatdata.com/2008/03/minethatdata-e-mail-analytics-and-data.html),
 * eBay paid search (Blake, Nosko & Tadelis, https://faculty.haas.berkeley.edu/stadelis/BNT_ECMA_rev.pdf)
 * and Yahoo display (Johnson, Lewis & Reiley, https://www.davidreiley.com/papers/AddMoreAds.pdf).
 */
import { type Micros, usd } from '../shared/money';
import type { Funnel } from './funnel';

export const SEGMENTS = ['hot', 'warm', 'cold'] as const;
export type Segment = (typeof SEGMENTS)[number];

/** Upper bounds, in days since last linked-game progress. Anything older is cold. */
export type SegmentDays = { hot: number; warm: number };
export const DEFAULT_SEGMENT_DAYS: SegmentDays = { hot: 3, warm: 14 };

export const segmentFor = (
  daysSinceActive: number,
  days: SegmentDays = DEFAULT_SEGMENT_DAYS,
): Segment =>
  daysSinceActive <= days.hot ? 'hot' : daysSinceActive <= days.warm ? 'warm' : 'cold';

/** Multipliers a segment applies to the platform funnel. Warm is the reference, so its lifts are 1. */
export type SegmentLift = { ctr: number; startRate: number; incrementality: number };
export const DEFAULT_SEGMENT_LIFT: Record<Segment, SegmentLift> = {
  // CTR × start 1.25 × 1.25 = ×1.56: Hillstrom's hot response is ×1.27 on visits and ×1.55 on
  // conversions. Incrementality: 0.75 is our reading of eBay (BNT) and direct mail (Gönül & Shi),
  // which are qualitative; 0.91 is Hillstrom hot vs warm visit share; 0.85 sits between.
  hot: { ctr: 1.25, startRate: 1.25, incrementality: 0.85 },
  warm: { ctr: 1, startRate: 1, incrementality: 1 },
  // Hillstrom 9–12 months vs 3–8: response ×0.83, incremental share ×1.30; 1.15 is the cautious side.
  cold: { ctr: 0.6, startRate: 0.8, incrementality: 1.15 },
};

const rate = (x: number) => Math.min(1, x);

export const segmentFunnel = (f: Funnel, lift: SegmentLift): Funnel => ({
  ...f,
  ctr: rate(f.ctr * lift.ctr),
  startRate: rate(f.startRate * lift.startRate),
  incrementality: rate(f.incrementality * lift.incrementality),
});

/**
 * The value tier stacks on recency: users ranked by past Link earnings. It also scales margin
 * per credited install and follow-on value, because big earners go deeper into a ladder and start
 * more offers. Only the response lift has evidence (Hillstrom top spenders, JLR at Yahoo: a larger
 * effect without lower incrementality); the margin ×1.5 is a guess and decides the case, so
 * Almedia's history must show ≥ 1.2 before media is bought.
 */
export const VALUE_TIERS = ['high', 'standard'] as const;
export type ValueTier = (typeof VALUE_TIERS)[number];
export type TierLift = SegmentLift & { margin: number; followOn: number };
export const DEFAULT_TIER_LIFT: Record<ValueTier, TierLift> = {
  high: { ctr: 1.2, startRate: 1.3, incrementality: 1, margin: 1.5, followOn: 3 },
  standard: { ctr: 1, startRate: 1, incrementality: 1, margin: 1, followOn: 1 },
};

export const tierFunnel = (f: Funnel, lift: TierLift): Funnel => ({
  ...segmentFunnel(f, lift),
  marginMultiplier: f.marginMultiplier * lift.margin,
  followOnValue: f.followOnValue * lift.followOn,
});

/**
 * Follow-on value per activated user, by segment and horizon, our estimate: later-offer margin net
 * of what the user would earn anyway, cut for ad-acquired users (published studies put them at
 * 0.41–0.87× the value: Lewis, JMR 2006, https://www.iaorifors.com/paper/53212; Datta, Foubert &
 * van Heerde, JMR 2015, https://research.tilburguniversity.edu/en/publications/the-challenge-of-retaining-customers-acquired-with-free-trials/).
 * Recent users are likelier to become multi-offer users. Weighted by who the ad activates, it blends to about
 * $1.8 at 90 days and $4.0 at 12 months, with a floor near $0. Dashboard only: the backend bidder
 * and the go decision count none until Almedia's cohorts measure it.
 */
export const DEFAULT_FOLLOW_ON: Record<Segment, { d90: Micros; m12: Micros }> = {
  hot: { d90: usd(2.3), m12: usd(5) },
  warm: { d90: usd(1.6), m12: usd(3.6) },
  cold: { d90: usd(1), m12: usd(2.2) },
};
