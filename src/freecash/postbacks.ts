/**
 * Postbacks are where money comes in. One authentic postback for a goal, within its window, from
 * the device we expected, bills the advertiser and credits the user's reward as pending, in a
 * single transaction (rewards.ts releases or reverses it later). Everything else is recorded with
 * the reason and moves no money. Business rejections still get a 200, so the MMP doesn't retry
 * them forever; a bad secret, or an advertiser we don't know, gets a 401 (deliberately the same,
 * so probing reveals nothing).
 * Three steps, each readable alone: parse the MMP's wire format (the only place that knows Unix
 * seconds and '1' strings), judge the event against the facts we hold (pure), then record.
 */
import { timingSafeEqual } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { normalizeAdId } from '../shared/adid';
import { DAY } from '../shared/clock';
import { newId } from '../shared/util';
import type { DbOrTx, Tx } from './db';
import type { Deps } from './deps';
import { acct, post } from './ledger';
import {
  advertisers,
  conversions,
  type Goal,
  goals,
  type Outcome,
  offerStarts,
  offers,
  postbacks,
} from './schema';

const SECOND = 1000;

type PostbackQuery = {
  secret: string;
  click_id: string;
  event: string;
  /** Unix seconds, as AppsFlyer and Adjust send them. */
  event_time: number;
  /** When the app was installed (Unix seconds). Lets later goals' deadlines count from the install even if the install postback is late. */
  install_time?: number;
  event_id?: string;
  device_id?: string;
  /** "1" when the MMP's fraud tooling blocked the install. */
  is_rejected?: string;
  rejection_reason?: string;
};

// ---- 1. Wire → domain ----

/** One MMP event in our units: times in epoch milliseconds, the ad ID normalised. */
export type PostbackEvent = {
  clickId: string;
  event: string;
  eventAt: number;
  /** The MMP's install time, when it sent one. */
  installedAt: number | null;
  /** What identifies this event across MMP retries. */
  dedupKey: string;
  deviceId: string | null;
  rejectedByMmp: boolean;
};

export function parsePostback(q: PostbackQuery): PostbackEvent {
  return {
    clickId: q.click_id,
    event: q.event,
    eventAt: q.event_time * SECOND,
    installedAt: q.install_time === undefined ? null : q.install_time * SECOND,
    // AppsFlyer sends no event ID (or an empty macro, hence `||`), so fall back to what
    // identifies one event: the click, the event name and its time.
    dedupKey: q.event_id || `${q.click_id}:${q.event}:${q.event_time}`,
    deviceId: normalizeAdId(q.device_id),
    rejectedByMmp: q.is_rejected === '1',
  };
}

// ---- 2. Rules (pure) ----

type Start = typeof offerStarts.$inferSelect;

/** What we hold about the event's click: the start (with its offer's advertiser), the goal, and whether it was paid. */
export type PostbackFacts = {
  start: (Start & { advertiserId: string }) | null;
  goal: Goal | null;
  alreadyPaid: boolean;
};

type Decision =
  | { outcome: 'converted'; start: Start; goal: Goal }
  | { outcome: 'unknown_click' }
  | { outcome: Exclude<Outcome, 'converted' | 'unknown_click' | 'duplicate'>; start: Start };

/** The decision for one event, checks in priority order. Only `converted` moves money. */
export function judgePostback(
  advertiserId: string,
  e: PostbackEvent,
  { start, goal, alreadyPaid }: PostbackFacts,
): Decision {
  // A click ID we never issued, or one issued for another advertiser's offer.
  if (!start || start.advertiserId !== advertiserId) return { outcome: 'unknown_click' };
  if (e.rejectedByMmp) return { outcome: 'rejected_by_mmp', start };
  if (!goal) return { outcome: 'not_a_goal', start };
  if (isBeforeStart(e, start)) return { outcome: 'before_start', start };
  if (e.eventAt > deadlineOf(e, start, goal)) return { outcome: 'past_deadline', start };
  // The install should be on the device we sent. A different one means a leaked click ID.
  if (e.deviceId && start.deviceId && e.deviceId !== start.deviceId)
    return { outcome: 'device_mismatch', start };
  if (alreadyPaid) return { outcome: 'already_converted', start };
  return { outcome: 'converted', start, goal };
}

/**
 * Windows use the event time, not arrival time: postbacks can be delayed by hours. Event times
 * are whole seconds, so the start is compared at second precision too.
 */
const isBeforeStart = (e: PostbackEvent, start: Start) =>
  e.eventAt < Math.floor(start.createdAt / SECOND) * SECOND;

/**
 * The install goal's deadline counts from the start; every later goal's from the install: the
 * MMP's install time when sent, else the one we recorded, else (install not seen yet) the start.
 */
function deadlineOf(e: PostbackEvent, start: Start, goal: Goal) {
  const from =
    goal.event === 'install'
      ? start.createdAt
      : (e.installedAt ?? start.installedAt ?? start.createdAt);
  return from + goal.deadlineDays * DAY;
}

/** The goal's reward, or the boost priced at Start if this is the boosted goal and it's in time. */
const rewardFor = (start: Start, goal: Goal, eventAt: number) =>
  start.boostEvent === goal.event &&
  start.boostReward !== null &&
  start.boostUntil !== null &&
  eventAt <= start.boostUntil
    ? start.boostReward
    : goal.reward;

/** Outcomes that don't prove the install was ours: a blocked install, a leaked click ID, an impossible time. */
const DISTRUSTED = new Set<Outcome>(['rejected_by_mmp', 'device_mismatch', 'before_start']);

/**
 * Later goals' deadlines count from the install, so we remember when it happened (once), but only
 * from a postback we trust for this start.
 */
function installToRecord(e: PostbackEvent, d: Decision) {
  if (d.outcome === 'unknown_click' || DISTRUSTED.has(d.outcome)) return null;
  const installedAt = e.installedAt ?? (e.event === 'install' ? e.eventAt : null);
  return installedAt === null ? null : { startId: d.start.id, installedAt };
}

// ---- 3. Persistence ----

export function handlePostback(
  { db, clock }: Pick<Deps, 'db' | 'clock'>,
  advertiserId: string,
  q: PostbackQuery,
): Outcome | 'unauthorized' {
  if (!isAuthentic(db, advertiserId, q.secret)) return 'unauthorized';
  const e = parsePostback(q);
  return db.transaction((tx) => {
    // MMPs retry, so the same event can arrive twice.
    if (isDuplicate(tx, advertiserId, e.dedupKey)) return 'duplicate';
    const decision = judgePostback(advertiserId, e, loadPostbackFacts(tx, e));
    const postbackId = insertPostback(tx, clock.now(), advertiserId, e, decision.outcome);
    if (decision.outcome === 'converted')
      recordConversion(tx, clock.now(), advertiserId, decision, e.eventAt, postbackId);
    const install = installToRecord(e, decision);
    if (install) rememberInstall(tx, install.startId, install.installedAt);
    return decision.outcome;
  });
}

function isAuthentic(db: DbOrTx, advertiserId: string, secret: string) {
  const advertiser = db.select().from(advertisers).where(eq(advertisers.id, advertiserId)).get();
  return advertiser !== undefined && safeEqual(advertiser.postbackSecret, secret);
}

const isDuplicate = (tx: Tx, advertiserId: string, dedupKey: string) =>
  tx
    .select({ id: postbacks.id })
    .from(postbacks)
    .where(and(eq(postbacks.advertiserId, advertiserId), eq(postbacks.dedupKey, dedupKey)))
    .get() !== undefined;

function loadPostbackFacts(tx: Tx, e: PostbackEvent): PostbackFacts {
  const row = tx
    .select({ start: offerStarts, advertiserId: offers.advertiserId })
    .from(offerStarts)
    .innerJoin(offers, eq(offers.id, offerStarts.offerId))
    .where(eq(offerStarts.id, e.clickId))
    .get();
  if (!row) return { start: null, goal: null, alreadyPaid: false };
  const { offerId, userId } = row.start;
  const goal = tx
    .select()
    .from(goals)
    .where(and(eq(goals.offerId, offerId), eq(goals.event, e.event)))
    .get();
  const paid = tx
    .select({ id: conversions.id })
    .from(conversions)
    .where(
      and(
        eq(conversions.userId, userId),
        eq(conversions.offerId, offerId),
        eq(conversions.event, e.event),
      ),
    )
    .get();
  return {
    start: { ...row.start, advertiserId: row.advertiserId },
    goal: goal ?? null,
    alreadyPaid: paid !== undefined,
  };
}

const insertPostback = (
  tx: Tx,
  now: number,
  advertiserId: string,
  e: PostbackEvent,
  outcome: Decision['outcome'],
) =>
  tx
    .insert(postbacks)
    .values({
      advertiserId,
      dedupKey: e.dedupKey,
      clickId: e.clickId,
      event: e.event,
      deviceId: e.deviceId,
      eventAt: e.eventAt,
      receivedAt: now,
      outcome,
    })
    .returning({ id: postbacks.id })
    .get().id;

/** The advertiser owes us the payout; we owe the user the reward, on hold for now. */
function recordConversion(
  tx: Tx,
  now: number,
  advertiserId: string,
  { start, goal }: { start: Start; goal: Goal },
  eventAt: number,
  postbackId: number,
) {
  const conversionId = newId('conv');
  const reward = rewardFor(start, goal, eventAt);
  tx.insert(conversions)
    .values({
      id: conversionId,
      offerStartId: start.id,
      userId: start.userId,
      offerId: start.offerId,
      event: goal.event,
      payout: goal.payout,
      reward,
      postbackId,
      createdAt: now,
    })
    .run();
  post(tx, now, 'conversion', conversionId, [
    { account: acct.advertiser(advertiserId), amount: goal.payout },
    { account: acct.revenue, amount: -goal.payout },
    { account: acct.rewards, amount: reward },
    { account: acct.userPending(start.userId), amount: -reward },
  ]);
}

const rememberInstall = (tx: Tx, startId: string, installedAt: number) =>
  tx
    .update(offerStarts)
    .set({ installedAt })
    .where(and(eq(offerStarts.id, startId), isNull(offerStarts.installedAt)))
    .run();

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
