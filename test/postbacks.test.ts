/** Each postback rule: what a goal pays, and every reason an event pays nothing. */
import { describe, expect, test } from 'bun:test';
import { acct, balance, owedToUser } from '../src/freecash/ledger';
import { judgePostback, type PostbackFacts, parsePostback } from '../src/freecash/postbacks';
import { advertisers, postbacks } from '../src/freecash/schema';
import { OFFER_GAME } from '../src/seed';
import { DAY } from '../src/shared/clock';
import { usd } from '../src/shared/money';
import { ledgerSum, startedOffer } from './helpers';

describe('each postback rule', () => {
  test('a goal pays once: user credited, advertiser billed, ledger balanced, in one transaction', async () => {
    const w = await startedOffer();
    expect((await w.postback()).data).toEqual({ outcome: 'converted' });
    expect(owedToUser(w.sys.db, w.user.id)).toBe(usd(0.2));
    expect(balance(w.sys.db, acct.advertiser(OFFER_GAME.advertiser.id))).toBe(usd(0.5));
    expect(balance(w.sys.db, acct.revenue)).toBe(-usd(0.5));
    expect(balance(w.sys.db, acct.rewards)).toBe(usd(0.2));
    expect(ledgerSum(w)).toBe(0);
  });

  test('wrong secret is rejected with 401 and not stored', async () => {
    const w = await startedOffer();
    const res = await w.postback({ secret: 'nope' });
    expect(res.status).toBe(401);
    expect(w.sys.db.select().from(postbacks).all()).toHaveLength(0);
  });

  test('the same event ID twice is a duplicate', async () => {
    const w = await startedOffer();
    await w.postback({ event_id: 'evt_same' });
    expect((await w.postback({ event_id: 'evt_same' })).data).toEqual({ outcome: 'duplicate' });
    expect(owedToUser(w.sys.db, w.user.id)).toBe(usd(0.2));
  });

  test('a click ID we never issued is unknown', async () => {
    const w = await startedOffer();
    expect((await w.postback({ click_id: 'clk_forged' })).data).toEqual({
      outcome: 'unknown_click',
    });
    expect(owedToUser(w.sys.db, w.user.id)).toBe(0);
  });

  test("another advertiser can't claim our click ID for their offer", async () => {
    const w = await startedOffer();
    w.sys.db
      .insert(advertisers)
      .values({ id: 'adv_other', name: 'Other', postbackSecret: 's2' })
      .run();
    expect((await w.postback({ secret: 's2' }, 'adv_other')).data).toEqual({
      outcome: 'unknown_click',
    });
  });

  test('an install on a different device than we sent is rejected as a mismatch', async () => {
    const w = await startedOffer();
    expect((await w.postback({ device_id: crypto.randomUUID() })).data).toEqual({
      outcome: 'device_mismatch',
    });
    expect(owedToUser(w.sys.db, w.user.id)).toBe(0);
  });

  test("deadline uses the event time (Unix seconds): on the deadline pays, a second later doesn't", async () => {
    const w = await startedOffer();
    const start = w.clock.now() / 1000;
    expect(
      (await w.postback({ event: 'level_10', event_time: start + (14 * DAY) / 1000 })).data,
    ).toEqual({ outcome: 'converted' });
    expect(
      (await w.postback({ event: 'level_30', event_time: start + (30 * DAY) / 1000 + 1 })).data,
    ).toEqual({ outcome: 'past_deadline' });
  });

  test('the rules in priority order, one row per outcome', () => {
    const t0 = Date.UTC(2026, 9, 1);
    const adv = 'adv_bubble';
    const start = {
      id: 'clk_1',
      userId: 'usr_1',
      offerId: 'bubble-saga-android',
      channel: 'offerwall' as const,
      adClickId: null,
      deviceId: 'dev-a',
      createdAt: t0,
      installedAt: null,
      boostEvent: null,
      boostReward: null,
      boostUntil: null,
      advertiserId: adv,
    };
    const goal = {
      offerId: start.offerId,
      event: 'install',
      label: 'Install',
      payout: usd(0.5),
      reward: usd(0.2),
      deadlineDays: 7,
      requiresPurchase: false,
      completionRate: 1,
      minDays: 0,
    };
    const facts: PostbackFacts = { start, goal, alreadyPaid: false };
    const event = (q: { event_time?: number; device_id?: string; is_rejected?: string } = {}) =>
      parsePostback({
        secret: 's',
        click_id: start.id,
        event: 'install',
        event_time: t0 / 1000 + 60,
        device_id: 'dev-a',
        ...q,
      });
    type Judged = ReturnType<typeof judgePostback>['outcome'];
    const rows: [Judged, ReturnType<typeof event>, PostbackFacts][] = [
      ['unknown_click', event(), { ...facts, start: null }],
      ['unknown_click', event(), { ...facts, start: { ...start, advertiserId: 'adv_other' } }],
      ['rejected_by_mmp', event({ is_rejected: '1' }), facts],
      ['not_a_goal', event(), { ...facts, goal: null }],
      ['before_start', event({ event_time: t0 / 1000 - 1 }), facts],
      ['past_deadline', event({ event_time: t0 / 1000 + 7 * 86_400 + 1 }), facts],
      ['device_mismatch', event({ device_id: 'dev-b' }), facts],
      ['already_converted', event(), { ...facts, alreadyPaid: true }],
      ['converted', event(), facts],
    ];
    for (const [outcome, e, f] of rows) expect(judgePostback(adv, e, f).outcome).toBe(outcome);
  });
});
