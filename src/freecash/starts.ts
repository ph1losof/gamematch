/**
 * Step two: the user taps Start. We mint the click ID that the advertiser's MMP will echo back in
 * every postback; that ID is what ties an install to a user, a reward and a bill. A start from our
 * ad also tells Freecash's own MMP (`offer_started`), so the network can optimise on it, and
 * carries the linked-player boost if the landing page offered one.
 * We only fire the advertiser's tracking link from here: on impression or ad click, MMPs would
 * flag it as click flooding.
 */
import { and, eq } from 'drizzle-orm';
import { HOUR } from '../shared/clock';
import type { Platform } from '../shared/types';
import { fillTemplate, newId } from '../shared/util';
import type { KnownClick } from './clicks';
import type { Config } from './config';
import type { Deps } from './deps';
import { getGoals, getOffer } from './offers';
import { type Boost, boostTerms, hasGoals } from './personalise';
import { type Channel, devices, games, offerStarts, offers, users } from './schema';

type StartRequest = {
  userId: string;
  offerId: string;
  channel: Channel;
  adClickId?: string;
  deviceId?: string | null;
  boost?: Boost | null;
};

/** Whether Freecash's MMP heard about a start from our ad. Measurement never blocks the user. */
type Reengagement = 'sent' | 'no_ad_id' | 'failed' | 'repeat_tap';

/** Returns the click ID and tracking URL, or null when the offer or user doesn't exist. */
export function startOffer(
  { db, clock, config }: Pick<Deps, 'db' | 'clock' | 'config'>,
  s: StartRequest,
) {
  const offer = getOffer(db, s.offerId);
  if (!offer || !db.select({ id: users.id }).from(users).where(eq(users.id, s.userId)).get())
    return null;
  // The device we expect the install on: the ad click's, or the user's device for this platform.
  const deviceId =
    s.deviceId ??
    db
      .select({ id: devices.deviceId })
      .from(devices)
      .where(and(eq(devices.userId, s.userId), eq(devices.platform, offer.platform)))
      .get()?.id ??
    null;
  const start = {
    id: newId('clk'),
    userId: s.userId,
    offerId: offer.id,
    channel: s.channel,
    adClickId: s.adClickId ?? null,
    deviceId,
    createdAt: clock.now(),
    boostEvent: s.boost?.event ?? null,
    boostReward: s.boost?.reward ?? null,
    boostUntil: s.boost?.until ?? null,
  };
  db.insert(offerStarts).values(start).run();
  const trackingUrl = trackingUrlFor(config, offer.trackingUrl, start);
  return { id: start.id, deviceId, platform: offer.platform, trackingUrl };
}

/** Start from the landing page's button, with the linked-player boost the page showed, priced now. */
export function startFromLanding(
  deps: Pick<Deps, 'db' | 'clock' | 'config' | 'attribution'>,
  click: KnownClick,
) {
  const ladder = getGoals(deps.db, click.offerId);
  const terms = hasGoals(ladder) ? boostTerms(deps.config, ladder) : null;
  const until = deps.clock.now() + deps.config.linkedBoost.hours * HOUR;
  return startFromAdClick(deps, click, terms && { ...terms, until });
}

/** Start straight from the ad (clickPath `direct`): no page was shown, so no boost. */
export const startDirect = (
  deps: Pick<Deps, 'db' | 'clock' | 'config' | 'attribution'>,
  click: KnownClick,
) => startFromAdClick(deps, click, null);

/**
 * One start per ad click: tapping Start again returns the first one, without a second boost
 * window or a second `offer_started`.
 */
async function startFromAdClick(
  deps: Pick<Deps, 'db' | 'clock' | 'config' | 'attribution'>,
  click: KnownClick,
  boost: Boost | null,
) {
  const existing = deps.db
    .select({ start: offerStarts, trackingUrl: offers.trackingUrl })
    .from(offerStarts)
    .innerJoin(offers, eq(offers.id, offerStarts.offerId))
    .where(eq(offerStarts.adClickId, click.id))
    .get();
  if (existing) {
    const trackingUrl = trackingUrlFor(deps.config, existing.trackingUrl, existing.start);
    return { id: existing.start.id, trackingUrl, reengagement: 'repeat_tap' as const };
  }
  const start = startOffer(deps, {
    userId: click.userId,
    offerId: click.offerId,
    channel: 'gamematch',
    adClickId: click.id,
    deviceId: click.deviceId,
    boost,
  });
  // The click's foreign keys guarantee the offer and the user exist.
  if (!start) throw new Error(`ad click ${click.id} points at a missing offer or user`);
  const reengagement = await reportReengagement(deps, start.platform, start.deviceId);
  return { id: start.id, trackingUrl: start.trackingUrl, reengagement };
}

/**
 * Tells Freecash's MMP the re-engaged user started an offer, so it can credit the network's click
 * and post back for optimisation. Without an ad ID (iOS without ATT) the MMP can't match the start
 * to a click user-by-user, so there is nothing to send; in production the Freecash app's own
 * Adjust SDK would still log the event. A failed report must not block the user's start, so it
 * comes back as `failed` instead of an error.
 */
async function reportReengagement(
  { config, attribution }: Pick<Deps, 'config' | 'attribution'>,
  platform: Platform,
  deviceId: string | null,
): Promise<Reengagement> {
  if (!deviceId) return 'no_ad_id';
  try {
    await attribution.trackEvent({
      appId: config.freecashAppId[platform],
      advertisingId: deviceId,
      event: 'offer_started',
    });
    return 'sent';
  } catch {
    return 'failed';
  }
}

/** The advertiser's MMP link for a start: our click ID, the device we expect, and our traffic tag. */
const trackingUrlFor = (
  config: Pick<Config, 'subSiteId'>,
  template: string,
  start: { id: string; deviceId: string | null; channel: Channel },
) =>
  fillTemplate(template, {
    click_id: start.id,
    device_id: start.deviceId ?? '',
    sub_site: start.channel === 'gamematch' ? config.subSiteId : 'offerwall',
  });

/** A start with its offer, game and tracking URL, or null. The start ID is the bearer token for its pages. */
export function getStart({ db, config }: Pick<Deps, 'db' | 'config'>, id: string) {
  const row = db
    .select({ start: offerStarts, offer: offers, game: games })
    .from(offerStarts)
    .innerJoin(offers, eq(offers.id, offerStarts.offerId))
    .innerJoin(games, eq(games.id, offers.gameId))
    .where(eq(offerStarts.id, id))
    .get();
  return row
    ? {
        ...row.start,
        offer: row.offer,
        game: row.game,
        trackingUrl: trackingUrlFor(config, row.offer.trackingUrl, row.start),
      }
    : null;
}
