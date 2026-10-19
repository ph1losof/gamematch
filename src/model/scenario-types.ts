/**
 * The shapes evaluate() takes and returns (and the option lists behind its string inputs), kept
 * apart from the arithmetic so every model module can share them without importing each other. Units are the model's: rates are
 * fractions, money is integer micros, and every price is per 1,000 impressions.
 */
import type { Micros } from '../shared/money';
import type { Platform } from '../shared/types';
import type { Funnel } from './funnel';
import type { GoalEconomics } from './goals';
import type { Region } from './market';
import type { Geo, PoolStep, Population } from './population';
import type { Segment, SegmentDays, SegmentLift, TierLift } from './segments';
import type { TornadoBar } from './sweeps';

export const HORIZONS = ['none', 'd90', 'm12'] as const;
export type Horizon = (typeof HORIZONS)[number];
export const BUY_MODES = ['cpm', 'cpa', 'revShare'] as const; // revShare: Link Offers, no auction
export type BuyMode = (typeof BUY_MODES)[number];
export type Status = 'green' | 'amber' | 'red';
export type GoalSlot = GoalEconomics & { label: string; enabled: boolean };

export type Scenario = {
  population: Population;
  segments: {
    days: SegmentDays; // labels only: shares are inputs, not derived from recency
    share: Record<Segment, number>;
    lift: Record<Segment, SegmentLift>;
    target: Record<Segment, boolean>;
  };
  /** Target only the high-value tier (top past Link earners): its share of users and its lifts. */
  valueTier: { highOnly: boolean; share: number; lift: TierLift };
  funnel: Record<Platform, Omit<Funnel, 'eligibility' | 'marginMultiplier' | 'followOnValue'>>;
  offer: {
    ladder: string;
    goals: GoalSlot[];
    completionScale: number; // multiplies every goal's completion rate (capped at 100%)
    rewardsFromShare: boolean; // true: reward = payout × userShare instead of each goal's reward
    userShare: number;
    eligibility: number; // share of users the offer accepts ("new players only")
  };
  followOn: {
    horizon: Horizon;
    value: Record<Exclude<Horizon, 'none'>, Record<Segment, Micros>>;
    ceiling: Micros;
  };
  market: {
    region: Region;
    cpm: Record<Platform, Micros>;
    medianClearing: Record<Region, Record<Platform, Micros>>;
    winCurve: { maxShare: number; steepness: number };
    platformFee: number; // share of the CPM we pay that the DSP keeps: the win curve sees the rest

    minWinRate: number;
    buyMode: BuyMode;
    cpaAuto: boolean; // CPA bid = maxCpa per cell, else the fixed cpa below
    cpa: Record<Platform, Micros>;
    revShare: number; // Link Offers: the host studio's share of net margin on every credited install
    euPayout: number; // EU offer payouts relative to the US (the reference)
    targetMargin: number;
    frequencyCap: number;
    requestsPerDay: number;
    dailyActiveShare: number;
    testDays: number;
  };
  experiment: { holdoutPct: number; budget: Micros; sd: Micros; alpha: number; power: number };
};

/** A scenario perturbed one input at a time, for the tornado. Texts are display labels. */
export type Variant = {
  key: string;
  label: string;
  lowText: string;
  highText: string;
  low: Scenario;
  high: Scenario;
};

export type Funnel1000 = {
  impressions: number;
  clicks: number;
  starts: number;
  installs: number;
  incremental: number;
  credited: number;
};

/** One platform × segment. */
export type Cell = {
  platform: Platform;
  segment: Segment;
  funnel: Funnel;
  value1000: Micros;
  bid: Micros; // what we pay per 1,000 impressions (fixed CPM, or the CPA bid's eCPM)
  profit1000: Micros;
  winRateAtBid: number;
  impressionsPerReachedUser: number; // over the test window
  funnel1000: Funnel1000;
};

export type PlatformVerdict = {
  status: Status;
  /** bidHigher: GREEN, but only once we pay `price`, because today's bid wins too few requests. */
  reason: 'profitable' | 'bidHigher' | 'needsFollowOn' | 'needsMore';
  profit1000: Micros; // at today's bid
  bid: Micros; // what we pay today
  price: Micros; // what the verdict is judged at: the bid, or the bid that wins minWinRate if higher
  winRate: number; // at today's bid
  minWinRate: number;
  followOnNeeded: Micros; // follow-on value that pays `price`; 0 when GREEN
  followOnCeiling: Micros;
  ctrNeeded: number | null; // base CTR that pays `price`; null when CTR isn't the lever
  horizon: Horizon;
  buyMode: BuyMode;
};

export type BidPoint = { bid: Micros; winRate: number; profit1000: Micros; campaignProfit: Micros };
export type OptimalBid = BidPoint & { activations: number };

/** Profit per 1,000 impressions over a grid of base CTR × follow-on value, and where today sits. */
export type Heatmap = {
  ctrs: number[];
  followOns: Micros[];
  cells: [number, number, Micros][];
  current: { ctr: number; followOn: Micros };
};

/** Per incremental install: what each goal brings, the follow-on counted, and what the price needs. */
export type Ladder = {
  goals: { label: string; value: Micros }[];
  followOn: Micros;
  needed: Micros;
};

export type Tornado = { base: Micros; bars: TornadoBar[] };

/** Spend, value and profit per user in the treated arm, over the test window. */
export type PerTreatedUser = { spend: Micros; value: Micros; profit: Micros; activations: number };

export type PlatformResult = {
  platform: Platform;
  cells: Record<Segment, Cell>;
  value1000: Micros;
  bid: Micros; // the one price paid per 1,000 impressions, in either buy mode
  profit1000: Micros;
  maxCpm: Micros;
  winRateAtBid: number;
  breakEvenCtr: number;
  breakEvenFollowOn: Micros;
  funnel1000: Funnel1000;
  enrollable: number;
  reached: number;
  perTreatedUser: PerTreatedUser;
  bidCurve: BidPoint[];
  optimal: OptimalBid;
  heatmap: Heatmap;
  ladder: Ladder;
  tornado: Tornado;
  verdict: PlatformVerdict;
};

export type Sizing = {
  spendPerTreatedUser: Micros;
  effect: Micros; // incremental profit per treated user
  effectSize: Micros; // |effect|, what the test has to resolve
  enrollable: number;
  enrolledByBudget: number;
  enrolled: number;
  budgetBinds: boolean;
  spent: Micros;
  mde: Micros;
  power: number;
  detectable: boolean;
  enrolledNeeded: number;
  budgetNeeded: Micros;
  activations: number;
  curve: { enrolled: number; mde: Micros }[];
};

export type Haul = { profit: Micros; activations: number };
/** The enrollable pool treated for one test-length wave: at today's bid and at the best bid. */
export type Prize = { atBid: Haul; atOptimal: Haul };

export type Outputs = {
  issues: string[];
  geo: Record<Geo, number>;
  segmentLabels: Record<Segment, string>;
  targeted: Segment[];
  offer: { marginPerInstall: Micros; userShare: number; goals: GoalEconomics[] };
  pool: PoolStep[];
  platforms: Record<Platform, PlatformResult>;
  sizing: Sizing;
  prize: Prize;
  verdict: { status: Status; platform: Platform };
};
