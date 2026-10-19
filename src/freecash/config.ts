/**
 * Every setting the system reads. The open product decisions are settings, so a test result
 * changes config, not code. Model numbers (funnel incl. the "new players only" eligibility, segment
 * lifts) come from src/model, so the dashboard starts from the same defaults as the bidder. The
 * bidder counts no follow-on value (DEFAULT_FUNNEL.followOnValue is 0): the go decision doesn't.
 */
import {
  DEFAULT_FREQUENCY_CAP,
  DEFAULT_FUNNEL,
  DEFAULT_HOLDOUT_PCT,
  DEFAULT_TARGET_MARGIN,
  type Funnel,
} from '../model/funnel';
import {
  DEFAULT_SEGMENT_DAYS,
  DEFAULT_SEGMENT_LIFT,
  DEFAULT_TIER_LIFT,
  type Segment,
  type SegmentDays,
  type SegmentLift,
  type TierLift,
  type ValueTier,
} from '../model/segments';
import { type Micros, usd } from '../shared/money';
import type { Platform } from '../shared/types';

/** The Freecash app per platform (real store IDs): what Freecash's MMP registers and iOS ATT is keyed by. */
export const FREECASH_APP_IDS: Record<Platform, string> = {
  android: 'com.freecash.app2',
  ios: 'de.rewards.app',
};

export type Config = {
  /** Where Freecash serves the ad's deep link and the user screens. */
  publicUrl: string;
  freecashAppId: Record<Platform, string>;

  // Open decisions
  clickPath: 'landing' | 'direct'; // landing page that explains the reward, or straight to the tracking link
  platforms: Platform[]; // which platforms we target
  requireAdsConsent: boolean; // only users who may be shown cross-app ads (EU opt-in, US not opted out)
  minAge: number;
  countries: string[]; // where the test runs (users.country): consent rules and payouts differ by country

  // Experiment
  holdoutPct: number;
  experimentSalt: string;
  subSiteId: string; // tags this traffic in the advertiser's MMP so they can see it separately

  // Segments: recency of linked-game activity, and how each segment shifts the funnel
  segmentDays: SegmentDays;
  segmentLift: Record<Segment, SegmentLift>;
  /**
   * Value tier: users whose Link earnings at enrollment reach this are "high". The cut is a
   * placeholder (about the top 15% of the simulated population); Almedia's earnings distribution sets it.
   */
  valueTierMinEarnings: Micros;
  tierLift: Record<ValueTier, TierLift>;

  // Bidding
  funnel: Record<Platform, Funnel>;
  targetMargin: number; // share of expected value we keep; we bid the rest
  /**
   * A fixed CPM per platform overrides the value-based bid. The first live test uses this: it buys
   * impressions at the market price on a capped budget to measure CTR and incrementality, which are
   * the inputs the value-based bid can't know yet.
   */
  fixedBidCpm: Partial<Record<Platform, Micros>>;
  frequencyCapPerDay: number;
  /**
   * The most the whole test may spend. Every campaign gets it as its lifetime budget at the network,
   * which stops serving at the cap without waiting for our reports; syncSpend pauses every campaign
   * once the booked total across campaigns reaches it. Spend booked between syncs can overshoot by up
   * to a sync's worth of delivery (no pacing in the MVP).
   */
  testBudget: Micros;
  /**
   * How much a genre match with a linked game raises an offer's expected margin when choosing which
   * offer a user sees. No published same-genre lift exists; 1.15 (1.0–1.3) is our design choice
   * so a match breaks near-ties, while margin per install varies several-fold between ladders.
   */
  genreMatchMultiplier: number;

  // Rewards
  /** Pending before cashable: our design choice, inside the 90 days Freecash's Terms allow it to hold credits. */
  rewardHoldDays: number;
  /**
   * Starts from our landing page: the lead goal pays `multiplier` × its reward within `hours` (capped
   * at its payout), only if it can be reached that fast (its minDays). `shareInWindow` is the share of
   * the lead goal's completions we expect inside the window, for pricing the boost into the bid: 1
   * (every completion boosted) until the test measures it.
   */
  linkedBoost: { multiplier: number; hours: number; shareInWindow: number };
};

export const defaultConfig = (publicUrl: string): Config => ({
  publicUrl,
  freecashAppId: FREECASH_APP_IDS,
  clickPath: 'landing',
  platforms: ['android', 'ios'],
  requireAdsConsent: true,
  minAge: 18,
  countries: ['US'],
  holdoutPct: DEFAULT_HOLDOUT_PCT,
  experimentSalt: 'gamematch-2026-10',
  subSiteId: 'gamematch',
  segmentDays: DEFAULT_SEGMENT_DAYS,
  segmentLift: DEFAULT_SEGMENT_LIFT,
  valueTierMinEarnings: usd(50),
  tierLift: DEFAULT_TIER_LIFT,
  funnel: DEFAULT_FUNNEL,
  targetMargin: DEFAULT_TARGET_MARGIN,
  fixedBidCpm: {},
  frequencyCapPerDay: DEFAULT_FREQUENCY_CAP,
  testBudget: usd(5000),
  genreMatchMultiplier: 1.15,
  rewardHoldDays: 30,
  linkedBoost: { multiplier: 2, hours: 48, shareInWindow: 1 },
});
