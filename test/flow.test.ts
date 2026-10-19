/** The path from ad to bill, through all three parties: who gets rewarded, who gets billed, and when nobody does. */
import { describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { FREECASH_APP_IDS } from '../src/freecash/config';
import { acct, balance, owedToUser } from '../src/freecash/ledger';
import { offerStarts, postbacks } from '../src/freecash/schema';
import { LINKED_GAME, MEDIA_SOURCE, OFFER_GAME } from '../src/seed';
import { usd } from '../src/shared/money';
import { Device } from '../src/sim/device';
import { ledgerSum, present, type World, world } from './helpers';

const owed = (w: World) => balance(w.sys.db, acct.advertiser(OFFER_GAME.advertiser.id));

describe('an ad tap becomes a paid, attributed install', () => {
  test('Android: ad → landing → start → install → goals; user rewarded and advertiser billed per goal', async () => {
    const w = await world();
    const { user, device } = w.linkedUser({ name: 'Alex Kim' });
    await w.enroll();
    await w.launch('android');

    const { landing, store } = await w.tapAdAndStart(device);
    expect(landing.html).toContain('Hi Alex! You already earn on Freecash with Kingdom Clash.');
    // Leads with the boosted first goal: 2 × $2.50 for linked players, total $12.70 + the $2.50 boost.
    expect(landing.html).toContain('Start with $5.00, earn up to $15.20 playing Bubble Saga');
    expect(landing.html).toContain('Linked-player bonus');
    expect(store.external).toBe(true);
    expect(store.url).toStartWith(
      `https://play.google.com/store/apps/details?id=${OFFER_GAME.appId.android}`,
    );

    const install = await w.games.android.install(device, store.url);
    expect(install.attribution).toBe(MEDIA_SOURCE);
    expect(owedToUser(w.sys.db, user.id)).toBe(usd(0.2));
    expect(owed(w)).toBe(usd(0.5));

    w.advance(3); // past the 48 h linked-player boost, so level 10 pays its normal $2.50
    await w.games.android.track(install.installId, 'level_10');
    w.advance(10);
    await w.games.android.track(install.installId, 'level_30');

    expect(owedToUser(w.sys.db, user.id)).toBe(usd(12.7));
    expect(owed(w)).toBe(usd(25.5));
    expect(ledgerSum(w)).toBe(0);
    const start = present(w.sys.db.select().from(offerStarts).get(), 'start');
    expect(start).toMatchObject({ userId: user.id, channel: 'gamematch', deviceId: device.adId });
  });

  test("Android with a zeroed GAID: the install referrer still carries our click, so it's credited", async () => {
    const w = await world();
    const { user, device } = w.linkedUser();
    await w.enroll();
    await w.launch('android');
    const { store } = await w.tapAdAndStart(device);

    // The user resets/opts out of their ad ID between the click and the first open.
    const optedOut = new Device(w.sys, { platform: 'android', adId: device.adId, optedOut: true });
    const install = await w.games.android.install(optedOut, store.url);
    expect(install.attribution).toBe(MEDIA_SOURCE);
    expect(owedToUser(w.sys.db, user.id)).toBe(usd(0.2));
  });

  test('iOS with tracking allowed in the offer game is credited by IDFA', async () => {
    const w = await world();
    const { user, device } = w.linkedUser({ platform: 'ios' });
    await w.enroll();
    await w.launch('ios');
    const { store } = await w.tapAdAndStart(device);
    expect(store.url).toStartWith('https://apps.apple.com/');

    const install = await w.games.ios.install(device, store.url);
    expect(install.attribution).toBe(MEDIA_SOURCE);
    expect(owedToUser(w.sys.db, user.id)).toBe(usd(0.2));
  });

  test("Start reports offer_started; Freecash's MMP credits the network's click and posts back to it", async () => {
    const w = await world();
    const { device } = w.linkedUser();
    await w.enroll();
    const campaign = await w.launch('android');
    await w.tapAdAndStart(device);
    const report = present((await w.freecash.admin.campaigns({ id: campaign.id }).get()).data);
    expect(report.networkConversions).toEqual({ offer_started: 1 });
  });
});

describe('nobody is paid when …', () => {
  test('… iOS has no tracking allowed in the offer game: only aggregate SKAdNetwork data, so no postback', async () => {
    const w = await world();
    const { user, device } = w.linkedUser({
      platform: 'ios',
      att: [FREECASH_APP_IDS.ios, LINKED_GAME.appId],
    });
    await w.enroll();
    await w.launch('ios');
    const { store } = await w.tapAdAndStart(device);

    const install = await w.games.ios.install(device, store.url);
    expect(install.attribution).toBe('organic');
    expect(owedToUser(w.sys.db, user.id)).toBe(0);
    expect(owed(w)).toBe(0);
  });

  test("… another network's later click wins last-click attribution: we paid for the ad and earn nothing", async () => {
    const w = await world();
    const { user, device } = w.linkedUser();
    await w.enroll();
    await w.launch('android');
    await w.tapAdAndStart(device);

    const competitorStore = await w.tapCompetitorAd(device);
    const install = await w.games.android.install(device, competitorStore.url);
    expect(install.attribution).toBe('othernet');
    expect(owedToUser(w.sys.db, user.id)).toBe(0);
    expect(owed(w)).toBe(0);

    await w.freecash.admin.spend.sync.post();
    expect(balance(w.sys.db, acct.network(w.sys.adNetwork.name))).toBeLessThan(0);
  });

  test('… the game was already on the device: a reinstall credits nobody', async () => {
    const w = await world();
    const { user, device } = w.linkedUser();
    await w.games.android.install(device); // played it before, organically
    await w.enroll();
    await w.launch('android');

    const { store } = await w.tapAdAndStart(device);
    const install = await w.games.android.install(device, store.url);
    expect(install.attribution).toBe('reinstall');
    expect(owedToUser(w.sys.db, user.id)).toBe(0);
  });

  test('… a goal is reached after its deadline: recorded, not paid', async () => {
    const w = await world();
    const { user, device } = w.linkedUser();
    await w.enroll();
    await w.launch('android');
    const { store } = await w.tapAdAndStart(device);
    const install = await w.games.android.install(device, store.url);

    w.advance(15); // level_10 must happen within 14 days of the install
    await w.games.android.track(install.installId, 'level_10');
    expect(owedToUser(w.sys.db, user.id)).toBe(usd(0.2));
    const pb = w.sys.db.select().from(postbacks).where(eq(postbacks.event, 'level_10')).get();
    expect(pb?.outcome).toBe('past_deadline');
  });

  test("… the advertiser's MMP blocks a fraudulent install: the rejection is recorded and pays nothing", async () => {
    const w = await world();
    const { user, device } = w.linkedUser();
    await w.enroll();
    await w.launch('android');
    const { store } = await w.tapAdAndStart(device);
    await w.mmp.admin.fraud.block.post({ deviceId: device.adId });

    const install = await w.games.android.install(device, store.url);
    expect(install.attribution).toBe('rejected');
    expect(w.sys.db.select().from(postbacks).get()?.outcome).toBe('rejected_by_mmp');
    expect(owedToUser(w.sys.db, user.id)).toBe(0);
  });
});
