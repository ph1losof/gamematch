/**
 * What a price buys in the auction, and how many ads a reached user then sees. Kept apart from the
 * cell arithmetic because the bid curve asks the same two questions at prices we don't pay.
 */
import type { Micros } from '../shared/money';
import type { Platform } from '../shared/types';
import { exchangeBid, winRate } from './market';
import type { Scenario } from './scenario-types';

/** The median clearing CPM at the exchange for this platform in the scenario's region. */
export const medianClearing = (s: Scenario, p: Platform): Micros =>
  s.market.medianClearing[s.market.region][p];

/**
 * Share of a user's ad requests won at `bid` (per 1,000 impressions, fee included). The exchange
 * sees the bid net of the platform fee. Link Offers has no auction: every view of the Offers screen
 * is ours.
 */
export const winAt = (s: Scenario, p: Platform, bid: Micros): number =>
  s.market.buyMode === 'revShare'
    ? 1
    : winRate(
        exchangeBid(bid, s.market.platformFee),
        medianClearing(s, p),
        s.market.winCurve.maxShare,
        s.market.winCurve.steepness,
      );

/**
 * Impressions per reached user over the test = daily-active share × min(frequency cap, requests
 * per active day × win rate) × test days.
 */
export const impressionsPerReachedUser = (s: Scenario, win: number): number =>
  s.market.dailyActiveShare *
  Math.min(s.market.frequencyCap, s.market.requestsPerDay * win) *
  s.market.testDays;
