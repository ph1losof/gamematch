/**
 * The journey's read-only panels: the ledger in words, the goal ladder with each goal's state, the
 * ad network's view of every campaign, and what Freecash recorded for a postback. Each reads
 * Freecash's own functions and tables directly (no HTTP), so the panels add no hops to the timeline.
 */
import { and, desc, eq } from 'drizzle-orm';
import { campaignReport } from '../../src/freecash/campaigns';
import type { Db } from '../../src/freecash/db';
import type { Deps } from '../../src/freecash/deps';
import { type Goal, getGoals } from '../../src/freecash/offers';
import {
  advertisers,
  campaigns,
  conversions,
  games,
  offerStarts,
  offers,
  postbacks,
} from '../../src/freecash/schema';
import { goalState } from '../../src/freecash/screens';
import type { Micros } from '../../src/shared/money';
import type { PostbackFacts } from './hops';
import type { GoalStatus, GoalView, JourneyState, LedgerRow, NetworkCampaign } from './types';

/** "Castle Siege hot": the campaign's game and segment, as the panels name it. */
export function campaignName(db: Db, id: string) {
  const row = db
    .select({ game: games.name, segment: campaigns.segment })
    .from(campaigns)
    .innerJoin(offers, eq(offers.id, campaigns.offerId))
    .innerJoin(games, eq(games.id, offers.gameId))
    .where(eq(campaigns.id, id))
    .get();
  return row ? `${row.game} ${row.segment}` : id;
}

/**
 * Ledger balances in words, split into who owes whom and profit & loss. Liabilities and revenue are
 * credits (negative), so they are flipped to read as positive amounts. The total is zero when the
 * books balance.
 */
export function ledgerView(
  db: Db,
  balances: Record<string, Micros>,
  firstName: string,
): JourneyState['ledger'] {
  const rows = Object.entries(balances).map(([account, amount]) =>
    ledgerRow(db, account, amount, firstName),
  );
  const pnl = rows.filter((r) => r.kind === 'pnl');
  return {
    rows,
    total: Object.values(balances).reduce((s, v) => s + v, 0),
    // Revenue was flipped to positive and costs are debits, so margin is revenue minus the rest.
    margin: pnl.reduce((s, r) => s + (r.account === 'revenue:offers' ? r.amount : -r.amount), 0),
  };
}

/** One ledger account in words, by its prefix (ledger.ts's `acct`). */
function ledgerRow(db: Db, account: string, amount: Micros, firstName: string): LedgerRow {
  const owed = (label: string, value: Micros): LedgerRow => ({
    account,
    label,
    kind: 'owed',
    amount: value,
  });
  const pnl = (label: string, value: Micros): LedgerRow => ({
    account,
    label,
    kind: 'pnl',
    amount: value,
  });
  const [kind = '', ...rest] = account.split(':');
  const id = rest.join(':');
  switch (kind) {
    case 'advertiser':
      return owed(`${advertiserName(db, id)} owes us`, amount);
    case 'user_pending':
      return owed(`We owe ${firstName} · on hold`, -amount);
    case 'user':
      return owed(`We owe ${firstName} · cashable`, -amount);
    case 'network':
      return owed(`We owe the ad network (${id})`, -amount);
    case 'revenue':
      return pnl('Revenue from advertisers', -amount);
    default:
      return pnl(expenseLabel(db, id), amount);
  }
}

/** `expense:rewards` or `expense:ad_spend:<campaign>`. */
function expenseLabel(db: Db, id: string) {
  const campaignId = id.replace(/^ad_spend:/, '');
  return campaignId === id ? 'Rewards paid to users' : `Ad spend · ${campaignName(db, campaignId)}`;
}

function advertiserName(db: Db, id: string) {
  const row = db.select().from(advertisers).where(eq(advertisers.id, id)).get();
  return row?.name ?? id;
}

/**
 * What Freecash recorded for a postback hop to it (`/postbacks/:advertiserId`); null for any other
 * hop. Nothing recorded means Freecash dropped it as a redelivery.
 */
export function postbackFacts(
  { db, config }: Pick<Deps, 'db' | 'config'>,
  url: string,
): PostbackFacts | null {
  const u = new URL(url);
  const advertiserId = u.pathname.match(/^\/postbacks\/([^/]+)$/)?.[1];
  if (u.origin !== new URL(config.publicUrl).origin || advertiserId === undefined) return null;
  const advertiser = advertiserName(db, advertiserId);
  const pb = lastPostback(
    db,
    u.searchParams.get('click_id') ?? '',
    u.searchParams.get('event') ?? '',
  );
  if (!pb) return { outcome: 'duplicate', advertiser, conversion: null };
  const conv = db.select().from(conversions).where(eq(conversions.postbackId, pb.id)).get();
  return {
    outcome: pb.outcome,
    advertiser,
    conversion: conv ? { payout: conv.payout, reward: conv.reward } : null,
  };
}

/** The latest postback Freecash recorded for one click ID and event. */
export const lastPostback = (db: Db, clickId: string, event: string) =>
  db
    .select()
    .from(postbacks)
    .where(and(eq(postbacks.clickId, clickId), eq(postbacks.event, event)))
    .orderBy(desc(postbacks.id))
    .get();

/** The offer start a click ID names. */
export const getStartRow = (db: Db, startId: string) =>
  db.select().from(offerStarts).where(eq(offerStarts.id, startId)).get();

/**
 * Each goal of the matched offer with its state: the progress page's (screens.goalState) once it is
 * paid; otherwise the postback's outcome if one was recorded, or `no_postback` if the game reported
 * the goal and no postback came (we weren't credited).
 */
export function goalViews(
  { db, clock, config }: Pick<Deps, 'db' | 'clock' | 'config'>,
  j: { offerId: string; userId: string; startId: string | null; played: Set<string> },
): GoalView[] {
  const start = j.startId ? getStartRow(db, j.startId) : undefined;
  const paid = new Map(
    db
      .select()
      .from(conversions)
      .where(and(eq(conversions.userId, j.userId), eq(conversions.offerId, j.offerId)))
      .all()
      .map((c) => [c.event, c]),
  );
  const progress = (g: Goal, conv?: Conversion): GoalStatus =>
    start ? goalState(g, conv, start, clock.now(), config.rewardHoldDays).kind : 'open';
  const recorded = (event: string) =>
    j.startId ? lastPostback(db, j.startId, event)?.outcome : undefined;
  const unpaid = (g: Goal): GoalStatus =>
    recorded(g.event) ?? (j.played.has(g.event) ? 'no_postback' : progress(g));
  return getGoals(db, j.offerId).map((g) => {
    const conv = paid.get(g.event);
    return goalView(g, conv, conv ? progress(g, conv) : unpaid(g));
  });
}

type Conversion = typeof conversions.$inferSelect;

function goalView(g: Goal, conv: Conversion | undefined, status: GoalStatus): GoalView {
  return {
    event: g.event,
    label: g.label,
    reward: conv?.reward ?? g.reward,
    payout: g.payout,
    deadlineDays: g.deadlineDays,
    requiresPurchase: g.requiresPurchase,
    status,
    boosted: conv !== undefined && conv.reward > g.reward,
  };
}

/** Every campaign as the network reports it (campaignReport), with the audience size from the last sync. */
export async function networkView(
  deps: Deps,
  audience: Map<string, number>,
  matchedCampaignId: string | null,
) {
  const rows: NetworkCampaign[] = [];
  for (const c of deps.db.select().from(campaigns).all()) {
    const r = await campaignReport(deps, c.id);
    if (!r) continue;
    rows.push({
      id: c.id,
      offer: campaignName(deps.db, c.id),
      segment: c.segment,
      bidCpm: c.bidCpm,
      audience: audience.get(c.id) ?? 0,
      impressions: r.impressions,
      clicks: r.adClicks,
      starts: r.offerStarts,
      spendReported: r.spendReported,
      spendBooked: r.spendBooked,
      conversions: r.networkConversions,
      matched: c.id === matchedCampaignId,
    });
  }
  return rows;
}
