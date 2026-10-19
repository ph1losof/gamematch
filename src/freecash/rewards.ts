/**
 * Rewards are held before the user can cash them out, the way Freecash holds credits while fraud
 * checks run (its Terms allow up to 90 days, https://freecash.com/en/policies/terms). After the
 * hold a reward is released to the user's cashable balance. Before that, a conversion can be
 * reversed if Almedia rules it Invalid Activity (Almedia Advertiser Terms §6.5/§7.5,
 * https://almedia.co/legal/advertiser-terms) or we find fraud; the reversal undoes both the bill
 * and the reward with a reversing entry. Advertisers get no chargebacks for users flagged later
 * (§7.8(b)): their only recourse is disputing an invoice within 5 business days (§7.10), which
 * Almedia alone decides. That decision is ops, not code here.
 */
import { and, eq, isNull, lte } from 'drizzle-orm';
import { DAY } from '../shared/clock';
import type { Deps } from './deps';
import { acct, post } from './ledger';
import { conversions, offers } from './schema';

export function releaseRewards({ db, clock, config }: Pick<Deps, 'db' | 'clock' | 'config'>) {
  const due = db
    .select()
    .from(conversions)
    .where(
      and(
        isNull(conversions.releasedAt),
        isNull(conversions.reversedAt),
        lte(conversions.createdAt, clock.now() - config.rewardHoldDays * DAY),
      ),
    )
    .all();
  db.transaction((tx) => {
    for (const c of due) {
      post(tx, clock.now(), 'reward_release', c.id, [
        { account: acct.userPending(c.userId), amount: c.reward },
        { account: acct.user(c.userId), amount: -c.reward },
      ]);
      tx.update(conversions).set({ releasedAt: clock.now() }).where(eq(conversions.id, c.id)).run();
    }
  });
  return { released: due.length };
}

/** Why a known conversion can no longer be reversed. */
type ReversalRefusal = 'already_reversed' | 'already_released';

/** The reversed conversion, null if we don't know it, or why it can no longer be reversed. */
export function reverseConversion({ db, clock }: Pick<Deps, 'db' | 'clock'>, conversionId: string) {
  const refused = (reason: ReversalRefusal) => ({ kind: 'refused' as const, reason });
  const row = db
    .select({ c: conversions, advertiserId: offers.advertiserId })
    .from(conversions)
    .innerJoin(offers, eq(offers.id, conversions.offerId))
    .where(eq(conversions.id, conversionId))
    .get();
  if (!row) return null;
  const { c } = row;
  if (c.reversedAt) return refused('already_reversed');
  // Once released the user may have cashed out; recovering that is a collections problem, not a ledger one.
  if (c.releasedAt) return refused('already_released');
  db.transaction((tx) => {
    post(tx, clock.now(), 'conversion_reversal', c.id, [
      { account: acct.advertiser(row.advertiserId), amount: -c.payout },
      { account: acct.revenue, amount: c.payout },
      { account: acct.rewards, amount: -c.reward },
      { account: acct.userPending(c.userId), amount: c.reward },
    ]);
    tx.update(conversions).set({ reversedAt: clock.now() }).where(eq(conversions.id, c.id)).run();
  });
  return { kind: 'reversed' as const, conversion: { id: c.id, reversed: true } };
}
