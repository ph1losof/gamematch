/**
 * The bid comes from expected value. Per impression, an incremental install happens with
 * probability ctr × startRate × installRate × incrementality, and is worth
 *   attributedRate × eligibility × margin per credited install × marginMultiplier
 *                     (only credited installs by players the offer accepts get paid)
 *   + follow-on value (the user is activated either way).
 * Margin per install sums each goal's (payout − reward) weighted by how many installers reach it,
 * with the linked-player boost's expected cost in the reward when the start carries one (withBoostCost).
 * The auction is first-price (AppLovin MAX, Auction dynamics,
 * https://support.applovin.com/en/max/demand-partners/auction-dynamics), so we bid the value minus
 * the margin we want to keep. Prices are per 1,000 impressions (CPM).
 * Campaigns can instead pay per offer start (CPA); see valuePerStart.
 * The backend bidder, scripts/roi.ts and the dashboard all call these functions.
 */
import type { Micros } from '../shared/money';
import type { Funnel } from './funnel';
import type { GoalEconomics } from './goals';

/** One cent in micros: CPA bids are whole cents. */
const CENT: Micros = 10_000;

export const marginPerInstall = (goals: GoalEconomics[]): Micros =>
  goals.reduce((sum, g) => sum + g.completionRate * (g.payout - g.reward), 0);

/**
 * The ladder as the bid should see it when a start carries a boost: the boosted goal's reward
 * rises by the boost's expected extra, (boosted − normal reward) × the share of its completions
 * that land inside the window. marginPerInstall then nets out completion × that extra, so every
 * bid and offer score built on the ladder prices the boost. No boost: the ladder unchanged.
 */
export function withBoostCost<G extends GoalEconomics & { event: string }>(
  goals: G[],
  boost: { event: string; reward: Micros } | null,
  shareInWindow: number,
): G[] {
  if (!boost) return goals;
  return goals.map((g) =>
    g.event === boost.event
      ? { ...g, reward: g.reward + shareInWindow * (boost.reward - g.reward) }
      : g,
  );
}

/**
 * What one incremental install earns from the offer. Eligibility only cuts this term: a user who
 * had the game before isn't paid for ("new players only"), but the ad still activated them.
 */
export const creditedMargin = (f: Funnel, goals: GoalEconomics[]): Micros =>
  f.attributedRate * f.eligibility * marginPerInstall(goals) * f.marginMultiplier;

/** Incremental installs per impression, credited or not. */
export const incrementalInstallsPerImpression = (f: Funnel) =>
  f.ctr * f.startRate * f.installRate * f.incrementality;

export const valuePerImpression = (f: Funnel, goals: GoalEconomics[]): Micros =>
  incrementalInstallsPerImpression(f) * (creditedMargin(f, goals) + f.followOnValue);

/**
 * Value of one offer start: what an outcome-priced (CPA) campaign on `offer_started` is worth.
 * Paying per start moves the CTR risk to the network, which only bids where it expects starts.
 */
export const valuePerStart = (f: Funnel, goals: GoalEconomics[]): Micros =>
  f.installRate * f.incrementality * (creditedMargin(f, goals) + f.followOnValue);

/** Max CPA per offer start, keeping `targetMargin`, rounded down to a whole cent. */
export const maxCpa = (f: Funnel, goals: GoalEconomics[], targetMargin: number): Micros =>
  Math.floor((valuePerStart(f, goals) * (1 - targetMargin)) / CENT) * CENT;

/**
 * A CPM rounded down to $0.001, so the per-impression price is a whole number of micros. It
 * rounds to whole micros first, so float noise (e.g. from blending segments) can't floor a step away.
 */
export const floorCpm = (cpm: Micros): Micros => Math.floor(Math.round(cpm) / 1000) * 1000;

/** Max CPM in micros: the value of 1,000 impressions minus our target margin, floored by floorCpm. */
export const maxCpm = (f: Funnel, goals: GoalEconomics[], targetMargin: number): Micros =>
  floorCpm(1000 * valuePerImpression(f, goals) * (1 - targetMargin));

/** The CTR at which paying `cpm` exactly breaks even. */
export const breakEvenCtr = (cpm: Micros, f: Funnel, goals: GoalEconomics[]) =>
  cpm / (1000 * valuePerImpression({ ...f, ctr: 1 }, goals));
