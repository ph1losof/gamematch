/** The experiment: who is in, who the network may target, and how the readout decides. */
import { describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { experimentMembers, offerStarts, users } from '../src/freecash/schema';
import { offerId } from '../src/seed';
import { usd } from '../src/shared/money';
import { present, readoutOf, world } from './helpers';

describe('the experiment', () => {
  test('only targetable, consented adults who never started an offer are enrolled', async () => {
    const w = await world();
    const ok = w.linkedUser();
    w.linkedUser({ adsConsent: false });
    w.linkedUser({ age: 17 });
    w.linkedUser({ optedOut: true }); // Android ad ID opted out
    w.linkedUser({ platform: 'ios', att: [] }); // no ATT in Freecash, so no IDFA
    const starter = w.linkedUser();
    w.sys.db
      .insert(offerStarts)
      .values({
        id: 'clk_old',
        userId: starter.user.id,
        offerId: offerId('android'),
        channel: 'offerwall',
        createdAt: 0,
      })
      .run();

    expect(await w.enroll()).toMatchObject({ treatment: 1, control: 0 });
    expect(w.sys.db.select().from(experimentMembers).get()?.userId).toBe(ok.user.id);
  });

  test("control users are never in the audience, so they're never served our ad", async () => {
    const w = await world({ holdoutPct: 50 });
    const people = Array.from({ length: 40 }, () => w.linkedUser());
    await w.enroll();
    await w.launch('android');
    const arms = new Map(
      w.sys.db
        .select()
        .from(experimentMembers)
        .all()
        .map((m) => [m.userId, m.arm]),
    );
    expect(new Set(arms.values())).toEqual(new Set(['treatment', 'control']));
    for (const { user, device } of people)
      expect((await w.tapAd(device)) !== null).toBe(arms.get(user.id) === 'treatment');
  });

  test('eligibility is checked again at every sync: a German user, or one who withdraws consent, leaves the audience', async () => {
    const w = await world();
    const stays = w.linkedUser();
    const moves = w.linkedUser();
    const withdraws = w.linkedUser();
    await w.enroll();
    await w.launch('android');
    for (const u of [stays, moves, withdraws]) expect(await w.tapAd(u.device)).not.toBeNull();

    w.sys.db.update(users).set({ country: 'DE' }).where(eq(users.id, moves.user.id)).run();
    w.sys.db.update(users).set({ adsConsent: false }).where(eq(users.id, withdraws.user.id)).run();
    const sizes = present((await w.freecash.admin.audiences.refresh.post()).data);
    expect(Object.values(sizes)).toEqual([1]);
    expect(await w.tapAd(stays.device)).not.toBeNull();
    expect(await w.tapAd(moves.device)).toBeNull();
    expect(await w.tapAd(withdraws.device)).toBeNull();

    // Intent-to-treat: they stay in their arm, so the readout still compares the arms as randomised.
    expect((await w.report()).arms.treatment.users).toBe(3);
  });

  test('profit per treated user is the margin lift minus ad spend per treated user', async () => {
    const r = await readoutOf({});
    const t = r.arms.treatment;
    const c = r.arms.control;
    expect(t.users + c.users).toBe(100);
    expect(t.margin).toBe(t.users * usd(0.3));
    expect(c.margin).toBe(15 * usd(0.3));
    expect(r.adSpend).toBeGreaterThan(0);
    expect(r.incremental.profitPerUser).toBeCloseTo(
      usd(0.3) - (15 * usd(0.3)) / c.users - r.adSpend / t.users,
    );
    expect(r.verdict).toBe('continue');
  });

  test('too few users or converters in an arm: insufficient, however clear the numbers look', async () => {
    expect((await readoutOf({}, { users: 20, controlInstalls: 5 })).verdict).toBe('insufficient');
    expect((await readoutOf({}, { controlInstalls: 3 })).verdict).toBe('insufficient');
  });
});
