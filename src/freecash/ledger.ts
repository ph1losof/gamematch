/**
 * Append-only double-entry ledger. Debits are positive, credits negative, and every transaction
 * sums to zero, so money can't appear or vanish. Corrections are new transactions, never edits.
 */
import { and, asc, eq, sql } from 'drizzle-orm';
import type { Micros } from '../shared/money';
import { newId } from '../shared/util';
import { type DbOrTx, onlyRow } from './db';
import { ledger } from './schema';

export const acct = {
  /** Liability: what we owe the user and they can cash out. Their balance is the negative of this. */
  user: (id: string) => `user:${id}`,
  /** Liability: rewards on hold, not yet cashable. Released to `user` after the hold, or reversed. */
  userPending: (id: string) => `user_pending:${id}`,
  /** Receivable: what the advertiser owes us. */
  advertiser: (id: string) => `advertiser:${id}`,
  /** Payable: what we owe the ad network, by its name (AdNetwork.name). */
  network: (name: string) => `network:${name}`,
  adSpend: (campaignId: string) => `expense:ad_spend:${campaignId}`,
  rewards: 'expense:rewards',
  revenue: 'revenue:offers',
};

type Entry = { account: string; amount: Micros };

export function post(db: DbOrTx, at: number, kind: string, ref: string, entries: Entry[]) {
  if (entries.some((e) => !Number.isSafeInteger(e.amount)))
    throw new Error(`${kind} ${ref}: amounts must be integer micros`);
  const sum = entries.reduce((s, e) => s + e.amount, 0);
  if (sum !== 0) throw new Error(`${kind} ${ref}: unbalanced by ${sum}`);
  const txnId = newId('txn');
  db.insert(ledger)
    .values(
      entries.map((e) => ({
        txnId,
        kind,
        ref,
        account: e.account,
        amount: e.amount,
        createdAt: at,
      })),
    )
    .run();
  return txnId;
}

const total = sql<number>`coalesce(sum(${ledger.amount}), 0)`;

export const balance = (db: DbOrTx, account: string): Micros =>
  onlyRow(db.select({ total }).from(ledger).where(eq(ledger.account, account)).get()).total;

export function balances(db: DbOrTx): Record<string, Micros> {
  const rows = db
    .select({ account: ledger.account, total })
    .from(ledger)
    .groupBy(ledger.account)
    .orderBy(asc(ledger.account))
    .all();
  return Object.fromEntries(rows.map((r) => [r.account, r.total]));
}

// `0 -` rather than unary minus, so an empty balance is 0 and not -0.
/** What the user can cash out now. */
export const userBalance = (db: DbOrTx, userId: string) => 0 - balance(db, acct.user(userId));
/** Everything we owe the user: cashable plus on hold. */
export const owedToUser = (db: DbOrTx, userId: string) =>
  userBalance(db, userId) - balance(db, acct.userPending(userId));

/** Booked amount on `account` for one `ref`, e.g. one campaign day of ad spend. */
export const bookedFor = (db: DbOrTx, account: string, ref: string): Micros =>
  onlyRow(
    db
      .select({ total })
      .from(ledger)
      .where(and(eq(ledger.account, account), eq(ledger.ref, ref)))
      .get(),
  ).total;
