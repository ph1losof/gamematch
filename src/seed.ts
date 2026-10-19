/**
 * The catalog the tests, demo and dev server share: two linked games (Kingdom Clash, strategy; Jewel
 * Mania, puzzle) where ads run, and two offer games on both platforms: Bubble Saga (puzzle, the
 * illustrative ladder by default) and Castle Siege (strategy, a high-value ladder shaped like real
 * Freecash offers). Each is set up on both sides: in Freecash's database and as an app in the
 * advertiser's MMP with Freecash as a partner. Freecash's own MMP gets the Freecash app.
 */
import { treaty } from '@elysiajs/eden';
import { FREECASH_APP_IDS } from './freecash/config';
import type { Db } from './freecash/db';
import { advertisers, devices, games, goals, links, offers, users } from './freecash/schema';
import { MOCK_NETWORK_NAME } from './mocks/adnetwork';
import { adIdParam, type MmpApp } from './mocks/mmp';
import { GOALS, type GoalSpec, OFFER_LADDERS } from './model/goals';
import { DAY } from './shared/clock';
import type { Micros } from './shared/money';
import { PLATFORMS, type Platform } from './shared/types';
import type { Urls } from './system';

/** Freecash's partner ID (media source) in advertisers' MMPs; `_int` follows AppsFlyer's integrated-partner naming. */
export const MEDIA_SOURCE = 'freecash_int';

export const LINKED_GAME = {
  id: 'kingdom-clash',
  name: 'Kingdom Clash',
  genre: 'Strategy',
  appId: 'com.kingdomclash.game',
};
/** A second linked game, so genre matching has two audiences to tell apart. */
export const LINKED_PUZZLE_GAME = {
  id: 'jewel-mania',
  name: 'Jewel Mania',
  genre: 'Puzzle',
  appId: 'com.jewelmania.game',
};
export const LINKED_GAMES = [LINKED_GAME, LINKED_PUZZLE_GAME];

type OfferGame = {
  id: string;
  name: string;
  genre: string;
  appId: Record<Platform, string>;
  advertiser: { id: string; name: string; postbackSecret: string };
};

export const OFFER_GAME = {
  id: 'bubble-saga',
  name: 'Bubble Saga',
  genre: 'Puzzle',
  appId: { android: 'com.bubblesaga.game', ios: 'id6400000001' },
  advertiser: { id: 'adv_bubble', name: 'Bubble Studio', postbackSecret: 'pb_secret_bubble' },
} satisfies OfferGame;
export const STRATEGY_GAME = {
  id: 'castle-siege',
  name: 'Castle Siege',
  genre: 'Strategy',
  appId: { android: 'com.castlesiege.game', ios: 'id6400000002' },
  advertiser: { id: 'adv_castle', name: 'Castle Games', postbackSecret: 'pb_secret_castle' },
} satisfies OfferGame;
export const offerId = (p: Platform, game: { id: string } = OFFER_GAME) => `${game.id}-${p}`;

export async function seedCatalog(
  db: Db,
  urls: Urls,
  fetcher: typeof fetch,
  ladders: { bubbleSaga?: GoalSpec[] } = {},
) {
  db.insert(games)
    .values(LINKED_GAMES.map((g) => ({ id: g.id, name: g.name, genre: g.genre })))
    .run();
  await seedOfferGame(db, urls, fetcher, OFFER_GAME, ladders.bubbleSaga ?? GOALS);
  await seedOfferGame(db, urls, fetcher, STRATEGY_GAME, OFFER_LADDERS.highValue);

  // Freecash's own MMP, with the ad network as a re-engagement partner that gets `offer_started`.
  const freecashMmp = treaty<MmpApp>(urls.freecashMmp, { fetcher });
  for (const platform of PLATFORMS) {
    const { error } = await freecashMmp.apps.post({
      appId: FREECASH_APP_IDS[platform],
      platform,
      storeUrl: storeUrl(platform, FREECASH_APP_IDS[platform]),
      partners: {
        [MOCK_NETWORK_NAME]: `${urls.adNetwork}/v1/postbacks?click_id={clickid}&event={event_name}&event_time={event_time}`,
      },
    });
    if (error) throw new Error(`Freecash MMP setup failed: ${error.status}`);
  }
}

async function seedOfferGame(
  db: Db,
  urls: Urls,
  fetcher: typeof fetch,
  game: OfferGame,
  ladder: GoalSpec[],
) {
  db.insert(games).values({ id: game.id, name: game.name, genre: game.genre }).run();
  db.insert(advertisers).values(game.advertiser).run();
  const mmp = treaty<MmpApp>(urls.mmp, { fetcher });
  for (const platform of PLATFORMS) {
    const appId = game.appId[platform];
    db.insert(offers)
      .values({
        id: offerId(platform, game),
        gameId: game.id,
        advertiserId: game.advertiser.id,
        platform,
        trackingUrl: `${urls.mmp}/click/${appId}?pid=${MEDIA_SOURCE}&clickid={click_id}&${adIdParam(platform)}={device_id}&af_siteid={sub_site}`,
      })
      .run();
    db.insert(goals)
      .values(ladder.map((g) => ({ ...g, offerId: offerId(platform, game) })))
      .run();
    // The advertiser sets Freecash up as a partner in its MMP. Clicks from other sources are still
    // recorded and can win attribution; they just have no postback to us.
    const { error } = await mmp.apps.post({
      appId,
      platform,
      storeUrl: storeUrl(platform, appId),
      partners: {
        // No event-ID macro, as with AppsFlyer; Freecash dedups on click + event + time.
        [MEDIA_SOURCE]: `${urls.freecash}/postbacks/${game.advertiser.id}?secret=${game.advertiser.postbackSecret}&click_id={clickid}&event={event_name}&device_id={advertising_id}&event_time={event_time}&install_time={install_time}&is_rejected={is_rejected}&rejection_reason={rejection_reason}`,
      },
    });
    if (error) throw new Error(`MMP setup failed: ${error.status}`);
  }
}

const storeUrl = (platform: Platform, appId: string) =>
  platform === 'android'
    ? `https://play.google.com/store/apps/details?id=${appId}`
    : `https://apps.apple.com/app/${appId}`;

export type SeedUser = {
  id: string;
  name: string;
  age: number;
  adsConsent: boolean;
  platform: Platform;
  deviceId: string;
  trackingAllowed: boolean;
  /** Days since the user last made progress in their linked game. */
  daysSinceActive: number;
  /** Defaults to Kingdom Clash. */
  linkedGameId?: string;
  /** Defaults to US. */
  country?: string;
  /** Lifetime Link earnings in micros; defaults to 0 (standard tier). */
  linkEarnings?: Micros;
};

/** Inserts a linked user with one device. Users without a usable ad ID still get a device row with tracking off. */
export function addUser(db: Db, u: SeedUser, now: number) {
  db.insert(users)
    .values({
      id: u.id,
      name: u.name,
      age: u.age,
      country: u.country ?? 'US',
      adsConsent: u.adsConsent,
      linkEarnings: u.linkEarnings ?? 0,
    })
    .run();
  db.insert(devices)
    .values({
      deviceId: u.deviceId,
      userId: u.id,
      platform: u.platform,
      trackingAllowed: u.trackingAllowed,
    })
    .run();
  db.insert(links)
    .values({
      userId: u.id,
      gameId: u.linkedGameId ?? LINKED_GAME.id,
      linkedAt: now - 60 * DAY,
      lastActiveAt: now - u.daysSinceActive * DAY,
    })
    .run();
}
