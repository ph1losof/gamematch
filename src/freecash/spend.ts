/**
 * Where money goes out: ad spend, booked from the network's daily report rows. A row can be
 * revised after its day (invalid-traffic credits), so each campaign day is booked to match the
 * latest row: the difference is posted as an adjustment, up or down. Re-running books nothing.
 * Syncs run one at a time, so two overlapping syncs can't book from different reads of a row
 * (within one process; production would use a database lock or a single scheduler).
 * Once the booked total across campaigns reaches the test budget, every campaign is paused: each
 * campaign's own network cap is the test budget too, so this is what holds the test as a whole to it.
 */
import type { Micros } from '../shared/money';
import type { Db } from './db';
import type { Deps } from './deps';
import { acct, balance, bookedFor, post } from './ledger';
import { campaigns } from './schema';

type Booked = Record<string, Micros>;

// The sync in flight per database; the next one waits for it.
const running = new WeakMap<Db, Promise<Booked>>();

export function syncSpend(deps: Pick<Deps, 'db' | 'clock' | 'config' | 'adNetwork'>) {
  const run = () => sync(deps);
  // A failed sync has already rejected to its own caller; the next one runs either way.
  const next = (running.get(deps.db) ?? Promise.resolve({})).then(run, run);
  running.set(deps.db, next);
  return next;
}

async function sync({
  db,
  clock,
  config,
  adNetwork,
}: Pick<Deps, 'db' | 'clock' | 'config' | 'adNetwork'>): Promise<Booked> {
  const booked: Booked = {};
  const all = db.select().from(campaigns).all();
  for (const c of all) {
    const { days } = await adNetwork.report(c.networkCampaignId);
    let total = 0;
    for (const day of days) {
      const ref = `${c.id}:${day.date}`;
      const delta = day.spend - bookedFor(db, acct.adSpend(c.id), ref);
      if (delta === 0) continue;
      post(db, clock.now(), 'ad_spend', ref, [
        { account: acct.adSpend(c.id), amount: delta },
        { account: acct.network(adNetwork.name), amount: -delta },
      ]);
      total += delta;
    }
    booked[c.id] = total;
  }
  const spent = all.reduce((s, c) => s + balance(db, acct.adSpend(c.id)), 0);
  if (spent >= config.testBudget) for (const c of all) await adNetwork.pause(c.networkCampaignId);
  return booked;
}
