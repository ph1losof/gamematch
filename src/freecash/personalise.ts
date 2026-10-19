/**
 * Personalisation rules, following what rewards apps do: Mistplay picks games "based on what
 * you're already playing" (https://support.mistplay.com/hc/en-us/articles/44735071658907), and
 * Unity's offerwall guidance advises a quick first win and a 2–3× bonus for users who never
 * converted (https://docs.unity.com/en-us/grow/offerwall/monetization/optimization/monetization-strategy).
 * All pure functions over goals and games, so they're easy to test and read:
 *  - which offer fits a user: never a game they already play, then the highest expected margin
 *    per credited install, where a genre match only breaks near-ties (genreMatchMultiplier);
 *  - which goal to lead with: the first goal (in ladder order) that needs no purchase and pays at
 *    least LEAD_GOAL_MIN, so the ad and page promise something quick and real, not the hardest step;
 *  - the linked-player boost on that goal, priced once, capped at what the advertiser pays, and only
 *    when the goal can be reached inside the window;
 *  - the ad copy per segment.
 * Every amount comes from the goal table, so nothing here can promise more than the offer pays.
 */
import { marginPerInstall, withBoostCost } from '../model/bidding';
import type { GoalEconomics, GoalSpec } from '../model/goals';
import type { Segment } from '../model/segments';
import { fmtUsd, type Micros, usd } from '../shared/money';
import type { Creative } from '../shared/types';
import type { Config } from './config';
import type { Game, Goal } from './offers';

/** A lead goal must pay at least this, so it reads as a real reward. Our design choice. */
const LEAD_GOAL_MIN = usd(0.5);

/** What the lead-goal and boost rules read from a goal: a stored Goal row or a model GoalSpec (scripts/roi.ts). */
type LadderGoal = Pick<GoalSpec, 'event' | 'reward' | 'payout' | 'minDays' | 'requiresPurchase'>;

/** An offer's goals, at least one: only such an offer can be launched or shown. */
export type Ladder<G> = [G, ...G[]];
export const hasGoals = <G>(goals: G[]): goals is Ladder<G> => goals.length > 0;

/** The goal to lead with. */
export const leadGoal = <G extends LadderGoal>(ladder: Ladder<G>): G =>
  ladder.find((g) => !g.requiresPurchase && g.reward >= LEAD_GOAL_MIN) ?? ladder[0];

/** What the ad can honestly promise: the sum of goals that need no purchase. */
export const freeTotal = (ladder: Goal[]) =>
  ladder.filter((g) => !g.requiresPurchase).reduce((s, g) => s + g.reward, 0);

/** The boosted goal and what it pays: what the page shows and the bid prices. */
export type BoostTerms = { event: string; reward: Micros };
/** The boost a start carries: the terms, until the window closes (`hours` after Start). */
export type Boost = BoostTerms & { until: number };

/**
 * The linked-player boost for a start made from our landing page: the lead goal pays
 * `multiplier` × its reward if reached within `hours`, never more than the goal's payout. At the
 * defaults (2× with a 50% user share) that gives the user the lead goal's whole margin, on purpose:
 * it buys conversion. Purchase goals are never boosted, and neither is a goal nobody can reach
 * inside the window ("play 7 days" in 48 hours): the page would promise a bonus no one can earn.
 * The window counts from Start and minDays from the install, so a goal that just fits needs a quick install.
 */
export function boostTerms(
  config: Pick<Config, 'linkedBoost'>,
  ladder: Ladder<LadderGoal>,
): BoostTerms | null {
  const lead = leadGoal(ladder);
  const { multiplier, hours } = config.linkedBoost;
  if (multiplier <= 1 || lead.requiresPurchase || lead.minDays * 24 > hours) return null;
  return { event: lead.event, reward: Math.min(lead.payout, Math.round(lead.reward * multiplier)) };
}

/**
 * The ladder the bid and the offer choice price: on the landing path with the boost's expected
 * cost in the lead goal's reward (withBoostCost); the direct path shows no page, so no boost.
 */
export function biddingLadder<G extends LadderGoal & { completionRate: number }>(
  config: Pick<Config, 'clickPath' | 'linkedBoost'>,
  ladder: G[],
): G[] {
  if (config.clickPath !== 'landing' || !hasGoals(ladder)) return ladder;
  return withBoostCost(ladder, boostTerms(config, ladder), config.linkedBoost.shareInWindow);
}

export function creativeFor(game: Game, ladder: Ladder<Goal>, segment: Segment): Creative {
  const lead = leadGoal(ladder);
  const upTo = `up to ${fmtUsd(freeTotal(ladder))}`;
  const headline: Record<Segment, string> = {
    hot: `Freecash: ${lead.label.toLowerCase()} in ${game.name}, get ${fmtUsd(lead.reward)}`,
    warm: `Freecash: earn ${upTo} playing ${game.name}`,
    cold: `Your Freecash account has a new game for you: ${game.name}`,
  };
  return {
    headline: headline[segment],
    body: `Start with ${fmtUsd(lead.reward)} for "${lead.label}", then ${upTo} in total. New players only. Terms apply.`,
    cta: 'See offer',
  };
}

/** `eligibility`: share of users the offer accepts ("new players only"). */
export type OfferOption = {
  offerId: string;
  gameId: string;
  genre: string;
  goals: GoalEconomics[];
  eligibility: number;
};
export type UserLinks = { gameIds: Set<string>; genres: Set<string> };

/**
 * The offer that fits a user best: never one whose game they already play, then the highest
 * expected margin per credited install × eligibility, scaled by `genreMatchMultiplier` when the game
 * shares a genre with a linked one. The ladder moves margin far more than genre does (our ladders
 * range $1.88–$7.97 per install), so a genre match only wins when margins are close. Null if none is left.
 */
export function bestOffer(
  user: UserLinks,
  options: OfferOption[],
  genreMatchMultiplier: number,
): string | null {
  const score = (o: OfferOption) =>
    marginPerInstall(o.goals) *
    o.eligibility *
    (user.genres.has(o.genre) ? genreMatchMultiplier : 1);
  const ranked = options
    .filter((o) => !user.gameIds.has(o.gameId))
    .sort((a, b) => score(b) - score(a));
  return ranked[0]?.offerId ?? null;
}
