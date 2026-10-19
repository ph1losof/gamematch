/** Money balances: the ledger, held rewards and reversals, ad spend, and the test budget. */
import { describe, expect, test } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import { openDb } from '../src/freecash/db';
import { acct, balance, owedToUser, post, userBalance } from '../src/freecash/ledger';
import { handlePostback } from '../src/freecash/postbacks';
import { conversions, goals, ledger, postbacks } from '../src/freecash/schema';
import { OFFER_GAME, offerId } from '../src/seed';
import { usd } from '../src/shared/money';
import { convertedUser, ledgerSum, present, startedOffer, world } from './helpers';

describe('money balances', () => {
  test('the ledger rejects unbalanced and fractional transactions', () => {
    const db = openDb();
    expect(() =>
      post(db, 0, 'x', 'r', [
        { account: 'a', amount: 5 },
        { account: 'b', amount: -4 },
      ]),
    ).toThrow('unbalanced');
    expect(() =>
      post(db, 0, 'x', 'r', [
        { account: 'a', amount: 0.5 },
        { account: 'b', amount: -0.5 },
      ]),
    ).toThrow('integer');
    expect(balance(db, 'a')).toBe(0);
  });

  test('a conversion and its ledger entries commit or roll back together', async () => {
    const w = await startedOffer();
    // Corrupt the goal so the ledger post fails after the conversion row is written.
    w.sys.db
      .update(goals)
      .set({ payout: 500_000.5 })
      .where(and(eq(goals.offerId, offerId('android')), eq(goals.event, 'install')))
      .run();

    const q = {
      secret: OFFER_GAME.advertiser.postbackSecret,
      click_id: w.clickId,
      event: 'install',
      event_id: 'evt_1',
      device_id: w.device.adId,
      event_time: w.clock.now() / 1000,
    };
    expect(() => handlePostback(w.sys, OFFER_GAME.advertiser.id, q)).toThrow('integer');
    expect(w.sys.db.select().from(conversions).all()).toHaveLength(0);
    expect(w.sys.db.select().from(postbacks).all()).toHaveLength(0);
    expect(w.sys.db.select().from(ledger).all()).toHaveLength(0);
  });

  test('a reward is owed but not cashable until the hold passes', async () => {
    const w = await convertedUser();
    expect(owedToUser(w.sys.db, w.user.id)).toBe(usd(0.2));
    expect(userBalance(w.sys.db, w.user.id)).toBe(0);

    w.advance(29);
    expect((await w.freecash.admin.rewards.release.post()).data).toEqual({ released: 0 });
    w.advance(1);
    expect((await w.freecash.admin.rewards.release.post()).data).toEqual({ released: 1 });
    expect(userBalance(w.sys.db, w.user.id)).toBe(usd(0.2));
    expect((await w.freecash.admin.rewards.release.post()).data).toEqual({ released: 0 });
    expect(ledgerSum(w)).toBe(0);
  });

  test('a reversal during the hold undoes the bill and the reward, and leaves the readout', async () => {
    const w = await convertedUser();
    const reverse = () => w.freecash.admin.conversions({ id: w.conversion.id }).reverse.post();
    expect((await reverse()).status).toBe(200);
    expect(owedToUser(w.sys.db, w.user.id)).toBe(0);
    expect(balance(w.sys.db, acct.advertiser(OFFER_GAME.advertiser.id))).toBe(0);
    expect(ledgerSum(w)).toBe(0);
    expect((await w.report()).arms.treatment.revenue).toBe(0);
    expect((await reverse()).status).toBe(409);
  });

  test("ad spend is booked per campaign day from the network's rows; re-syncing books nothing new", async () => {
    const w = await world();
    const { device } = w.linkedUser();
    await w.enroll();
    const campaign = await w.launch('android');
    await w.tapAdAndLand(device);
    await w.tapAdAndLand(device);

    const twoImpressions = (2 * campaign.bidCpm) / 1000;
    const sync = async () => present((await w.freecash.admin.spend.sync.post()).data)[campaign.id];
    expect(await sync()).toBe(twoImpressions);
    expect(await sync()).toBe(0);
    expect(balance(w.sys.db, acct.adSpend(campaign.id))).toBe(twoImpressions);
    expect(balance(w.sys.db, acct.network(w.sys.adNetwork.name))).toBe(-twoImpressions);

    const report = present((await w.freecash.admin.campaigns({ id: campaign.id }).get()).data);
    expect(report).toMatchObject({
      impressions: 2,
      adClicks: 2,
      offerStarts: 0,
      spendBooked: report.spendReported,
    });
  });

  test('once booked spend reaches the test budget, the spend sync pauses every campaign', async () => {
    // $15 CPM: each impression costs $0.015, so a $0.03 budget buys two.
    const w = await world({
      fixedBidCpm: { android: usd(15) },
      testBudget: usd(0.03),
      frequencyCapPerDay: 5,
    });
    const hot = w.linkedUser({ daysSinceActive: 1 });
    const cold = w.linkedUser({ daysSinceActive: 30 });
    await w.enroll();
    await w.launch('android', 'hot');
    await w.launch('android', 'cold');
    await w.tapAd(hot.device);
    await w.tapAd(hot.device);
    expect(await w.tapAd(cold.device)).not.toBeNull(); // the cold campaign has its own cap, so the network still serves it
    await w.freecash.admin.spend.sync.post();
    expect(await w.tapAd(cold.device)).toBeNull();
  });
});
