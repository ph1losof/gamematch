/**
 * The funnel and market defaults the bidder, the ROI script and the dashboard all start from.
 * Each rate's published sources, range and reasoning are in the dashboard's citation table
 * (dashboard/citations.ts: ctrA, startA, installA, credA, credI, incrA, eligibility). In short:
 * - CTR: Playio, Mobile game ad CTR benchmarks 2026 (full-screen 2–15%, accidental taps included),
 *   https://blog.playio.co/mobile-game-ad-ctr-benchmarks-2026; 2.5% is our estimate of real taps.
 * - Credited installs: Android's Install Referrer carries the click
 *   (https://developer.android.com/google/play/installreferrer); iOS needs ATT in the game
 *   (Adjust, Gaming app insights 2026: ~39% opt-in,
 *   https://a.storyblok.com/f/47007/x/20551740ee/gaming-app-insights-report-2026.pdf).
 * - Incrementality: Johnson, Lewis & Nubbemeyer, "Ghost Ads", JMR 2017
 *   (https://api.crossref.org/works/10.1509/jmr.15.0297) and Sahni et al., JMR 2019
 *   (https://api.crossref.org/works/10.1177/0022243718813987); 40% is our estimate.
 * - Landing → Start and Start → install have no public benchmark: our estimates, ask Almedia.
 */
import type { Micros } from '../shared/money';
import type { Platform } from '../shared/types';

/** Funnel rates we expect for a platform. */
export type Funnel = {
  ctr: number; // ad impression -> click
  startRate: number; // landing page -> taps Start
  installRate: number; // Start -> installs the game
  attributedRate: number; // install -> credited to Freecash (others can win last click; iOS needs ATT in the game)
  eligibility: number; // share of these users the offer still pays for: most offers are "new players only"
  incrementality: number; // share of installs that would not have happened without the ad
  marginMultiplier: number; // margin per credited install vs the offer's average (value tier, region payouts); 1 = average
  followOnValue: Micros; // later-offer margin of a user activated by the ad, credited or not (unknown: ask Almedia)
};

/**
 * "New players only": a new-user restriction is on 67% of US Freecash offers and on 59 of the 68
 * paying $1,000 or more (our count of Scrimpr's Freecash offer feed, 19 Oct 2026,
 * https://scrimpr.co.uk/gpt-search-engine/). A user who has had the game before can't be
 * credited, so 0.65 (0.4–0.9) until Almedia counts install overlap from app lists and MMP rejections.
 */
export const DEFAULT_ELIGIBILITY = 0.65;

export const DEFAULT_FUNNEL: Record<Platform, Funnel> = {
  android: {
    ctr: 0.025,
    startRate: 0.3,
    installRate: 0.6,
    attributedRate: 0.88,
    eligibility: DEFAULT_ELIGIBILITY,
    incrementality: 0.4,
    marginMultiplier: 1,
    followOnValue: 0,
  },
  ios: {
    ctr: 0.025,
    startRate: 0.3,
    installRate: 0.6,
    attributedRate: 0.45,
    eligibility: DEFAULT_ELIGIBILITY,
    incrementality: 0.4,
    marginMultiplier: 1,
    followOnValue: 0,
  },
};

export const DEFAULT_TARGET_MARGIN = 0.2;
export const DEFAULT_FREQUENCY_CAP = 2;
export const DEFAULT_HOLDOUT_PCT = 20;
