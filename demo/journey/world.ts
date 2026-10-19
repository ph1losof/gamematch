/**
 * The world one journey runs in, built from a persona: an in-process System on a manual clock,
 * Alex's phone (one ad ID, and on iOS a tracking choice per app) and Alex's Freecash account.
 * Kept apart from journey.ts so the steps there read as steps, not as setup.
 */
import { treaty } from '@elysiajs/eden';
import type { FreecashApp } from '../../src/freecash/app';
import { FREECASH_APP_IDS } from '../../src/freecash/config';
import { getGoals } from '../../src/freecash/offers';
import { bestOffer } from '../../src/freecash/personalise';
import type { AdNetworkApp } from '../../src/mocks/adnetwork';
import {
  addUser,
  LINKED_GAME,
  LINKED_PUZZLE_GAME,
  OFFER_GAME,
  offerId,
  type SeedUser,
  STRATEGY_GAME,
  seedCatalog,
} from '../../src/seed';
import type { ManualClock } from '../../src/shared/clock';
import { Device } from '../../src/sim/device';
import { gameSdk } from '../../src/sim/game';
import { createInProcessSystem, type System } from '../../src/system';
import { type Persona, SEGMENT_DAYS } from './persona';
import type { Page, Timeline } from './timeline';

const USER = { id: 'usr_alex', name: 'Alex Kim', age: 25 };

/** The two games a campaign can offer Alex, in the order step 1 launches them. */
export const OFFER_GAMES = [OFFER_GAME, STRATEGY_GAME];
export type OfferGame = (typeof OFFER_GAMES)[number];

const LINKED: Record<Persona['linkedGame'], typeof LINKED_GAME> = {
  'kingdom-clash': LINKED_GAME,
  'jewel-mania': LINKED_PUZZLE_GAME,
};

export type World = {
  sys: System;
  device: Device;
  user: SeedUser;
  linked: typeof LINKED_GAME;
  /** Pages the phone rendered, oldest first. */
  pages: Page[];
  /** The fetch of every actor but the phone (game SDKs, the operator); it records their hops. */
  fetcher: typeof fetch;
  freecash: ReturnType<typeof treaty<FreecashApp>>;
  adNetwork: ReturnType<typeof treaty<AdNetworkApp>>;
};

/** Builds the System, Alex's phone and Alex's account; seedWorld then stores them. */
export function createWorld(persona: Persona, clock: ManualClock, timeline: Timeline): World {
  const sys = createInProcessSystem({ clock, config: { holdoutPct: 0 }, onHop: timeline.onHop });
  const linked = LINKED[persona.linkedGame];
  const pages: Page[] = [];
  const optedOut = persona.platform === 'android' && persona.optedOut;
  const device = new Device(
    {
      fetch: timeline.fetchFor(sys.fetch, (page) => pages.push(page)),
      isInternal: (url) => sys.isInternal(url),
    },
    {
      platform: persona.platform,
      att: trackingAllowedIn(persona, linked.appId),
      optedOut,
      freecashApp: persona.inApp
        ? { host: new URL(sys.urls.freecash).host, userId: USER.id }
        : undefined,
    },
  );
  const fetcher = timeline.fetchFor(sys.fetch);
  return {
    sys,
    device,
    user: alexAccount(persona, device.adId, !optedOut, linked.id),
    linked,
    pages,
    fetcher,
    freecash: treaty<FreecashApp>(sys.urls.freecash, { fetcher }),
    adNetwork: treaty<AdNetworkApp>(sys.urls.adNetwork, { fetcher }),
  };
}

/** Seeds the catalog (without recording its hops) and Alex's account. */
export async function seedWorld({ sys, user }: World, timeline: Timeline) {
  await timeline.quietly(() => seedCatalog(sys.db, sys.urls, sys.fetch));
  addUser(sys.db, user, sys.clock.now());
}

/** The apps Alex let track them on iOS (ATT is per app). Freecash always has it here. */
function trackingAllowedIn(persona: Persona, linkedAppId: string) {
  const apps = [FREECASH_APP_IDS.ios];
  if (persona.attInAdGame) apps.push(linkedAppId);
  if (persona.attInOfferGame) apps.push(...OFFER_GAMES.map((g) => g.appId.ios));
  return apps;
}

/**
 * Alex's Freecash account as Freecash stores it. Tracking is allowed unless Alex opted out on
 * Android; on iOS the Freecash app always has ATT here.
 */
function alexAccount(
  persona: Persona,
  deviceId: string,
  trackingAllowed: boolean,
  linkedGameId: string,
): SeedUser {
  return {
    ...USER,
    adsConsent: true,
    platform: persona.platform,
    deviceId,
    trackingAllowed,
    daysSinceActive: SEGMENT_DAYS[persona.segment],
    linkedGameId,
  };
}

/** The game SDK of one offer game on Alex's phone, reporting to the advertiser's MMP. */
export const sdkOf = (world: World, game: OfferGame) =>
  gameSdk(world.sys.urls.mmp, world.fetcher, game.appId[world.device.platform]);

/**
 * "Already had the game": installs, organically and before the demo, the offer game step 1 will
 * pick, found by the same rule the audience plan uses (bestOffer).
 */
export async function installBefore(world: World): Promise<OfferGame> {
  const { sys, device, linked } = world;
  const options = OFFER_GAMES.map((g) => ({
    offerId: g.id,
    gameId: g.id,
    genre: g.genre,
    goals: getGoals(sys.db, offerId(device.platform, g)),
    eligibility: 1,
  }));
  const links = { gameIds: new Set([linked.id]), genres: new Set([linked.genre]) };
  const pick = bestOffer(links, options, sys.config.genreMatchMultiplier);
  const game = OFFER_GAMES.find((g) => g.id === pick);
  if (!game) throw new Error('personalisation picked no offer game');
  await sdkOf(world, game).install(device);
  return game;
}
