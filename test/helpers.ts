/**
 * The one test fixture: a fresh in-process world (Freecash, the ad network and both MMPs, with the
 * catalog seeded) and the actions a test takes in it, through the same HTTP contracts production
 * uses. Time is a ManualClock, moved by `advance`, never waited out.
 */
import { treaty } from '@elysiajs/eden';
import { type Config, FREECASH_APP_IDS } from '../src/freecash/config';
import { balances } from '../src/freecash/ledger';
import { conversions, experimentMembers } from '../src/freecash/schema';
import type { Segment, ValueTier } from '../src/model/segments';
import { addUser, LINKED_GAME, OFFER_GAME, offerId, type SeedUser, seedCatalog } from '../src/seed';
import { DAY, ManualClock } from '../src/shared/clock';
import type { Platform } from '../src/shared/types';
import { Device } from '../src/sim/device';
import { gameSdk } from '../src/sim/game';
import { createInProcessSystem } from '../src/system';

export type World = Awaited<ReturnType<typeof world>>;

/** The value, or a failed test when it is missing: the guard for rows and responses a test expects. */
export function present<T>(value: T | null | undefined, what = 'value'): T {
  if (value === null || value === undefined) throw new Error(`expected a ${what}`);
  return value;
}

/** Where a redirect response points. */
export const locationOf = (res: Response) => present(res.headers.get('location'), 'location');

/** Sum of every ledger account. Double-entry means it is always zero. */
export const ledgerSum = (w: World) => Object.values(balances(w.sys.db)).reduce((s, b) => s + b, 0);

/** A fresh in-process world. Holdout is 0 unless set. */
export async function world(config: Partial<Config> = {}) {
  const clock = new ManualClock();
  const sys = createInProcessSystem({ clock, config: { holdoutPct: 0, ...config } });
  await seedCatalog(sys.db, sys.urls, sys.fetch);
  const freecash = treaty(sys.freecash);
  const ads = treaty(sys.adNetworkMock);
  const mmp = treaty(sys.mmpMock);
  const games = {
    android: gameSdk(sys.urls.mmp, sys.fetch, OFFER_GAME.appId.android),
    ios: gameSdk(sys.urls.mmp, sys.fetch, OFFER_GAME.appId.ios),
  };
  // Per world, so user IDs (and therefore experiment arms) don't depend on test order.
  let userSeq = 0;

  /**
   * A linked Freecash user and their phone. `att` lists the iOS apps where they allowed tracking;
   * by default everywhere (Freecash, the linked game, the offer game). `inApp` installs the
   * Freecash app, logged in, so ad clicks open in the app instead of the web fallback.
   */
  function linkedUser(
    opts: Partial<SeedUser> & {
      platform?: Platform;
      att?: string[];
      optedOut?: boolean;
      inApp?: boolean;
    } = {},
  ) {
    const platform = opts.platform ?? 'android';
    const att = opts.att ?? [FREECASH_APP_IDS.ios, LINKED_GAME.appId, OFFER_GAME.appId.ios];
    const id = opts.id ?? `usr_${++userSeq}`;
    const freecashApp = opts.inApp
      ? { host: new URL(sys.urls.freecash).host, userId: id }
      : undefined;
    const device = new Device(sys, { platform, att, optedOut: opts.optedOut, freecashApp });
    const u: SeedUser = {
      id,
      name: 'Alex Kim',
      age: 25,
      adsConsent: true,
      platform,
      deviceId: device.adId,
      trackingAllowed: platform === 'ios' ? att.includes(FREECASH_APP_IDS.ios) : !opts.optedOut,
      daysSinceActive: 1,
      ...opts,
    };
    addUser(sys.db, u, clock.now());
    return { user: u, device };
  }

  const enroll = async () => present((await freecash.admin.experiment.enroll.post()).data);

  /** Launches an offer (Bubble Saga by default) for one segment and tier; test users are recently active ("hot") and standard-tier unless set otherwise. */
  async function launch(
    platform: Platform = 'android',
    segment: Segment = 'hot',
    valueTier: ValueTier = 'standard',
    game: { id: string } = OFFER_GAME,
  ) {
    const { data, error } = await freecash.admin.campaigns.post({
      offerId: offerId(platform, game),
      segment,
      valueTier,
    });
    if (error) throw new Error(`launch failed: ${JSON.stringify(error.value)}`);
    return data;
  }

  /** The publisher game asks the network for an ad; the user taps it. Returns the click URL or null if no ad. */
  async function tapAd(device: Device) {
    const served = await ads.sim.serve.post({
      deviceId: device.adIdFor(LINKED_GAME.appId),
      publisherApp: LINKED_GAME.appId,
      floorCpm: 0,
    });
    if (!served.data?.filled) return null;
    const click = await ads.sim.click.post({ impressionId: served.data.impressionId });
    return present(click.data, 'click URL').url;
  }

  /** Ad tap → landing page. */
  const tapAdAndLand = async (device: Device) =>
    device.open(present(await tapAd(device), 'served ad'));

  /** Ad tap → landing page → Start. Returns the landing visit and where the Start button took the user. */
  async function tapAdAndStart(device: Device) {
    const landing = await tapAdAndLand(device);
    const store = await device.open(`${landing.url}/start`, { method: 'POST' });
    return { landing, store };
  }

  /** Today's flow: the logged-in user taps Start on the offerwall. Returns the response (303 to the tracking link). */
  const offerwallStart = (userId: string, platform: Platform = 'android') =>
    sys.freecash.handle(
      new Request(`${sys.urls.freecash}/offers/${offerId(platform)}/start`, {
        method: 'POST',
        headers: { 'x-user-id': userId },
      }),
    );

  /** Another network's ad for the same game: its click goes through the MMP with a different media source. */
  async function tapCompetitorAd(device: Device, platform: Platform = 'android') {
    const appId = OFFER_GAME.appId[platform];
    return device.open(
      `${sys.urls.mmp}/click/${appId}?pid=othernet&clickid=x&advertising_id=${device.adIdFor(appId)}`,
    );
  }

  const report = async () => present((await freecash.admin.experiment.get()).data, 'readout');
  const advance = (days: number) => clock.advance(days * DAY);

  return {
    sys,
    clock,
    freecash,
    ads,
    mmp,
    games,
    linkedUser,
    enroll,
    launch,
    tapAd,
    tapAdAndLand,
    tapAdAndStart,
    offerwallStart,
    tapCompetitorAd,
    report,
    advance,
  };
}

/**
 * A user who started the Android offer from the offerwall, and a `postback` that sends the
 * advertiser's MMP postback for that click (an install now, with a fresh event ID, unless set).
 */
export async function startedOffer() {
  const w = await world();
  const { user, device } = w.linkedUser();
  const clickId = present(
    new URL(locationOf(await w.offerwallStart(user.id))).searchParams.get('clickid'),
    'click ID',
  );
  let seq = 0;
  const postback = (
    q: Partial<{
      secret: string;
      click_id: string;
      event: string;
      event_id: string;
      device_id: string;
      event_time: number;
      install_time: number;
    }> = {},
    advertiserId = OFFER_GAME.advertiser.id,
  ) =>
    w.freecash.postbacks({ advertiserId }).get({
      query: {
        secret: OFFER_GAME.advertiser.postbackSecret,
        click_id: clickId,
        event: 'install',
        event_id: `evt_${++seq}`,
        device_id: device.adId,
        event_time: Math.floor(w.clock.now() / 1000),
        ...q,
      },
    });
  return { ...w, user, device, clickId, postback };
}

/** A treated user who installed from our ad, so they have one pending conversion. */
export async function convertedUser() {
  const w = await world({ rewardHoldDays: 30 });
  const { user, device } = w.linkedUser();
  await w.enroll();
  await w.launch('android');
  const { store } = await w.tapAdAndStart(device);
  await w.games.android.install(device, store.url);
  const conversion = present(w.sys.db.select().from(conversions).get(), 'conversion');
  return { ...w, user, conversion };
}

/**
 * A 50/50 test of `users` users. Treatment users all install from the ad. In control,
 * `controlInstalls` users install from the offerwall on their own, so the control arm has the
 * converters the data floor asks for. Returns the readout.
 */
export async function readoutOf(
  config: Partial<Config>,
  { users = 100, controlInstalls = 15 } = {},
) {
  const w = await world({ holdoutPct: 50, ...config });
  const people = Array.from({ length: users }, () => w.linkedUser());
  await w.enroll();
  await w.launch('android');
  const members = w.sys.db.select().from(experimentMembers).all();
  const arm = new Map(members.map((m) => [m.userId, m.arm]));
  let organic = 0;
  for (const { user, device } of people) {
    if (arm.get(user.id) === 'treatment') {
      const { store } = await w.tapAdAndStart(device);
      await w.games.android.install(device, store.url);
    } else if (organic++ < controlInstalls) {
      const store = await device.open(locationOf(await w.offerwallStart(user.id)));
      await w.games.android.install(device, store.url);
    }
  }
  await w.freecash.admin.spend.sync.post();
  return w.report();
}
