/** Offer goal ladders. The seed offer and the dashboard's ladder presets come from here. */
import { type Micros, usd } from '../shared/money';

export type GoalEconomics = { payout: Micros; reward: Micros; completionRate: number };
/** `minDays`: the earliest a player can reach the goal, in days after the install ("play 7 days" is 7; 0 if it can be quick). */
export type GoalSpec = GoalEconomics & {
  event: string;
  label: string;
  deadlineDays: number;
  minDays: number;
  requiresPurchase?: boolean;
};

/** The illustrative Bubble Saga ladder used by the seed data, tests and demo. */
export const GOALS: GoalSpec[] = [
  {
    event: 'install',
    label: 'Install and open the game',
    payout: usd(0.5),
    reward: usd(0.2),
    deadlineDays: 7,
    minDays: 0,
    completionRate: 1,
  },
  {
    event: 'level_10',
    label: 'Reach level 10',
    payout: usd(5),
    reward: usd(2.5),
    deadlineDays: 14,
    minDays: 0,
    completionRate: 0.35,
  },
  {
    event: 'level_30',
    label: 'Reach level 30',
    payout: usd(20),
    reward: usd(10),
    deadlineDays: 30,
    minDays: 0,
    completionRate: 0.07,
  },
];

const goal = (
  event: string,
  label: string,
  reward: number,
  deadlineDays: number,
  completionRate: number,
  minDays = 0,
  userShare = 0.5,
): GoalSpec => ({
  event,
  label,
  reward: usd(reward),
  payout: usd(reward / userShare),
  deadlineDays,
  minDays,
  completionRate,
  requiresPurchase: event.startsWith('purchase'),
});

/**
 * Strategy: the Puzzles & Chaos: Frozen Castle US Android ladder on Freecash (Scrimpr, 19 Oct 2026;
 * some rungs summed), purchase-heavy: margin ≈ $7.97.
 */
const HIGH_VALUE: GoalSpec[] = [
  goal('install', 'Install and reach castle 5', 0.42, 1, 0.8),
  goal('castle_10', 'Castle 10 and play 7 days', 4.3, 7, 0.3, 7),
  goal('purchase_day1', 'First purchase on day 1', 1.1, 1, 0.05),
  goal('castle_15', 'Reach castle 15', 53.4, 14, 0.04),
  goal('purchase_30', 'Spend $10–30 within 30 days', 16.2, 30, 0.03),
  goal('purchase_100', 'Spend $50–100 within 30 days', 71, 30, 0.01),
  goal('castle_22', 'Reach castle 22', 84.75, 18, 0.015),
  goal('castle_25', 'Reach castle 25', 135, 30, 0.007),
  goal('castle_30', 'Reach castle 30', 247.5, 60, 0.003),
];
const PREMIUM_COMPLETION = 0.88;

/**
 * Reward rungs copy real Freecash offers listed on Scrimpr (https://scrimpr.co.uk/gpt-search-engine/,
 * 19 Oct 2026, 4-star account level; e.g. https://freecash.com/academy/en/discover/games/toon-blast,
 * https://freecash.com/academy/en/discover/games/puzzles-chaos). Payout = reward ÷ 50% user share.
 * Completion rates are our estimates: ask Almedia.
 */
export const OFFER_LADDERS = {
  /** Casual (Monopoly GO / Toon Blast rungs): margin ≈ $3.17 per credited install. */
  median: [
    goal('install', 'Install and play 2 minutes', 0.01, 1, 0.95),
    goal('level_100', 'Reach level 100 and play 2 days', 1.4, 3, 0.4, 2),
    goal('purchase_1', 'First purchase cashback', 2.4, 7, 0.04),
    goal('level_400', 'Reach level 400', 20, 14, 0.06),
    goal('purchase_2', 'Second cashback stage', 7, 14, 0.015),
    goal('level_1000', 'Reach level 1,000', 90, 30, 0.01),
    goal('level_4000', 'Reach level 4,000', 150, 90, 0.002),
  ],
  highValue: HIGH_VALUE,
  /**
   * A top-decile offer: the high-value ladder with every completion rate × 0.88, so margin ≈ $7.0 per
   * credited install, about the p90 of our modelled margins when our completion curve is applied to
   * the reward ladders of the 611 US Freecash offers on Scrimpr (19 Oct 2026; modelled median $4.75,
   * p90 $6.8, max $9.5). Estimates, not observed margins.
   */
  premium: HIGH_VALUE.map((g) => ({ ...g, completionRate: g.completionRate * PREMIUM_COMPLETION })),
} satisfies Record<string, GoalSpec[]>;
