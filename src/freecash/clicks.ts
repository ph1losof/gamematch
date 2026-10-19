/**
 * Step one between our ad and the game: the ad click. We record it and resolve the user: in the
 * Freecash app the logged-in session says who it is; on the web fallback, the ad ID the network
 * filled in does. Nothing here fires the advertiser's link.
 * On the web fallback the ad ID also picks the account a Start rewards, since Start asks for no
 * login there. Accepted for the MVP because the damage is bounded: the start is tied to the ad-ID
 * owner's device, an install from any other device is rejected (device_mismatch in postbacks.ts),
 * and rewards can only reach the owner's account, never whoever tapped. What's left is a shared or
 * resold phone crediting its registered owner. A Freecash web login before Start closes it.
 */
import { eq } from 'drizzle-orm';
import { normalizeAdId } from '../shared/adid';
import { newId } from '../shared/util';
import type { DbOrTx } from './db';
import type { Deps } from './deps';
import { adClicks, campaigns, devices, users } from './schema';

export function recordAdClick(
  { db, clock }: Pick<Deps, 'db' | 'clock'>,
  campaignId: string,
  q: { ifa?: string; imp?: string; pub?: string },
  sessionUserId?: string,
) {
  const campaign = db.select().from(campaigns).where(eq(campaigns.id, campaignId)).get();
  if (!campaign) return null;
  const deviceId = normalizeAdId(q.ifa);
  const sessionUser = sessionUserId
    ? db.select({ id: users.id }).from(users).where(eq(users.id, sessionUserId)).get()
    : undefined;
  const device = deviceId
    ? db.select().from(devices).where(eq(devices.deviceId, deviceId)).get()
    : undefined;
  const click = {
    id: newId('adc'),
    campaignId,
    userId: sessionUser?.id ?? device?.userId ?? null,
    deviceId,
    impressionId: q.imp ?? null,
    publisherApp: q.pub ?? null,
    createdAt: clock.now(),
  };
  db.insert(adClicks).values(click).run();
  return { ...click, offerId: campaign.offerId };
}

/** The ad click with its campaign's offer, or null. */
export function getAdClick(db: DbOrTx, id: string) {
  const row = db
    .select({ click: adClicks, offerId: campaigns.offerId })
    .from(adClicks)
    .innerJoin(campaigns, eq(campaigns.id, adClicks.campaignId))
    .where(eq(adClicks.id, id))
    .get();
  return row ? { ...row.click, offerId: row.offerId } : null;
}

export type AdClick = NonNullable<ReturnType<typeof getAdClick>>;
/** An ad click whose user we resolved: only such a click can start an offer. */
export type KnownClick = AdClick & { userId: string };
