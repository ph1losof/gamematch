/**
 * The market we buy in: in-app full-screen prices by OS and region (fee included), and the share
 * of ad requests a bid wins. CPM medians are derived from published publisher eCPMs (Appodeal, The
 * latest eCPM report 2025, https://appodeal.com/wp-content/uploads/2025/03/Appodeal-The-Latest-eCPM-Report-2025.pdf;
 * Tenjin ad monetization Q2 2024, https://gamedevreports.substack.com/p/tenjin-ad-monetization-in-mobile-00b).
 * The win curve has the log-logistic form of Zhang et al., Optimal real-time bidding, KDD 2014
 * (https://wnzhang.net/papers/ortb-kdd.pdf); its 0.8 cap and 2.5 steepness are our estimates. No
 * platform publishes in-app win curves, so the test should measure the real one (loss notices
 * report the price needed to win).
 */
import { type Micros, usd } from '../shared/money';
import type { Platform } from '../shared/types';

export const REGIONS = ['us', 'eu'] as const;
export type Region = (typeof REGIONS)[number];

/** Median clearing CPM at the exchange, per OS and region. */
export const MEDIAN_CLEARING_CPM: Record<Region, Record<Platform, Micros>> = {
  us: { android: usd(10), ios: usd(12) },
  eu: { android: usd(4.5), ios: usd(7) },
};

/** CPM paid including platform fees: low / base / high. */
export const CPM_PAID: Record<Region, Record<Platform, [Micros, Micros, Micros]>> = {
  us: { android: [usd(10), usd(17), usd(28)], ios: [usd(13), usd(21), usd(35)] },
  eu: { android: [usd(5), usd(8), usd(14)], ios: [usd(7), usd(12), usd(19)] },
};

/**
 * Offer payouts by region, relative to the US: the same game pays less elsewhere while EU CPMs
 * (above) already sit lower. About 800 matched offers each for the UK and Germany: ~0.79 (Android
 * 0.81, iOS 0.75–0.77). France 0.60 (Android 0.68, iOS 0.56), Poland 0.39 (Scrimpr global feed,
 * 19 Oct 2026, our count, https://scrimpr.co.uk/gpt-search-engine/). These are reward ratios, so
 * they assume the same user share everywhere. 0.8 (0.7–0.8) is the UK/Germany end.
 */
export const REGION_PAYOUT_MULTIPLIER: Record<Region, number> = { us: 1, eu: 0.8 };

/**
 * Share of what we pay that the DSP or network keeps before bidding at the exchange: 25% (15–35%),
 * our estimate. Google discloses 31–32% kept on Google Ads buys
 * (https://support.google.com/adsense/answer/180195) and a 15% DV360 fee
 * (https://blog.google/products/admanager/display-buying-share-revenue-publishers/); performance
 * DSPs disclose nothing. CPM_PAID includes it; MEDIAN_CLEARING_CPM and the win curve's bid don't.
 */
export const DEFAULT_PLATFORM_FEE = 0.25;

/** The bid that reaches the exchange when we pay `paidCpm`: what's left after the platform fee. */
export const exchangeBid = (paidCpm: Micros, platformFee: number): Micros =>
  paidCpm * (1 - platformFee);

/**
 * Share of a reached user's ad requests our bid wins: maxShare × b^s / (median^s + b^s), with b
 * the exchange bid (net of fee) and s the steepness. maxShare (0.8) is request-level: of a reached
 * user's ad requests, the share open to an outside bid at any price (the rest go to direct deals,
 * first-look or exchanges we don't buy). It is a different question from list reach's user-level
 * supply factor. When the frequency cap binds, maxShare only matters at low bids.
 */
export function winRate(bid: Micros, medianClearing: Micros, maxShare = 0.8, steepness = 2.5) {
  if (bid <= 0) return 0;
  const b = bid ** steepness;
  return (maxShare * b) / (medianClearing ** steepness + b);
}

/**
 * Share of users with a usable ad ID that a campaign reaches in 14 days: active in ad-funded apps
 * 65% × ID in the bid request (Android 98%; iOS 35%, host-game ATT) × our DSP sees the supply 80%
 * × wins at least once 97%. The supply factor is user-level: the share of users whose apps sell at
 * least once in 14 days on exchanges our DSP buys (winRate's maxShare is the request-level
 * question). The ID gate itself is `usableId`. Our estimate; no platform publishes list reach.
 */
export const LIST_REACH_14D: Record<Platform, number> = { android: 0.49, ios: 0.18 };
