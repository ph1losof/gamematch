/**
 * The experiment readout. It compares net margin per user across arms, after charging the
 * treatment arm the ad spend, overall and per segment, tier and platform. The per-stratum rows say
 * where to scale and where to stop. Beside it, the credited-install lift: a yes/no per user, so
 * far less noisy than margin, it can show the ad works long before margin can show it pays.
 */
import { and, eq, exists, gte, isNotNull, isNull, sql } from 'drizzle-orm';
import { meanDifference, profitPerTreatedUser, verdictFor } from '../model/readout';
import { SEGMENTS, type Segment, VALUE_TIERS, type ValueTier } from '../model/segments';
import type { Micros } from '../shared/money';
import { PLATFORMS, type Platform } from '../shared/types';
import type { DbOrTx } from './db';
import { acct, balance } from './ledger';
import { type Arm, campaigns, conversions, experimentMembers, offerStarts, offers } from './schema';

type Strata = { segment: Segment; valueTier: ValueTier; platform: Platform };
type Row = Strata & {
  arm: Arm;
  started: boolean;
  installed: boolean;
  converted: boolean;
  revenue: Micros;
  rewards: Micros;
};

export function experimentReport(db: DbOrTx) {
  const rows = memberRows(db);
  // A campaign targets one segment, one tier and one platform (its offer's), so its spend belongs to each of them.
  const spend = db
    .select({
      id: campaigns.id,
      segment: campaigns.segment,
      valueTier: campaigns.valueTier,
      platform: offers.platform,
    })
    .from(campaigns)
    .innerJoin(offers, eq(offers.id, campaigns.offerId))
    .all()
    .map((c) => ({ ...c, amount: balance(db, acct.adSpend(c.id)) }));
  const by = <K extends keyof Strata>(key: K, values: readonly Strata[K][]) =>
    // SAFETY: the entries cover every value of the stratum's union, so every key is present.
    Object.fromEntries(
      values.map((v) => [
        v,
        summarize(
          rows.filter((r) => r[key] === v),
          spend.reduce((s, c) => (c[key] === v ? s + c.amount : s), 0),
        ),
      ]),
    ) as Record<Strata[K], ReturnType<typeof summarize>>;

  return {
    ...summarize(
      rows,
      spend.reduce((s, c) => s + c.amount, 0),
    ),
    bySegment: by('segment', SEGMENTS),
    byTier: by('valueTier', VALUE_TIERS),
    byPlatform: by('platform', PLATFORMS),
  };
}

/** One row per member: did they start any offer, did a credited install follow, and the margin of everything they completed since enrolling. */
function memberRows(db: DbOrTx): Row[] {
  const sinceEnrollment = and(
    eq(offerStarts.userId, experimentMembers.userId),
    gte(offerStarts.createdAt, experimentMembers.enrolledAt),
  );
  return db
    .select({
      arm: experimentMembers.arm,
      segment: experimentMembers.segment,
      valueTier: experimentMembers.valueTier,
      platform: experimentMembers.platform,
      started: exists(db.select().from(offerStarts).where(sinceEnrollment)).mapWith(Boolean),
      // installedAt is set only from a postback we trust, which the advertiser's MMP sends only for an install it credited to us.
      installed: exists(
        db
          .select()
          .from(offerStarts)
          .where(and(sinceEnrollment, isNotNull(offerStarts.installedAt))),
      ).mapWith(Boolean),
      converted: sql<number>`count(${conversions.id}) > 0`.mapWith(Boolean),
      revenue: sql<number>`coalesce(sum(${conversions.payout}), 0)`,
      rewards: sql<number>`coalesce(sum(${conversions.reward}), 0)`,
    })
    .from(experimentMembers)
    .leftJoin(
      conversions,
      and(
        eq(conversions.userId, experimentMembers.userId),
        gte(conversions.createdAt, experimentMembers.enrolledAt),
        isNull(conversions.reversedAt),
      ),
    )
    .groupBy(experimentMembers.userId)
    .all();
}

const rate = (n: number, users: number) => (users ? n / users : 0);

/** Counts and money for one arm. */
function armStats(rows: Row[]) {
  const count = (pick: (r: Row) => boolean) => rows.reduce((n, r) => (pick(r) ? n + 1 : n), 0);
  const users = rows.length;
  const revenue = rows.reduce((s, r) => s + r.revenue, 0);
  const rewards = rows.reduce((s, r) => s + r.rewards, 0);
  const starters = count((r) => r.started);
  const installers = count((r) => r.installed);
  return {
    users,
    starters,
    installers,
    converters: count((r) => r.converted),
    revenue,
    rewards,
    margin: revenue - rewards,
    startRate: rate(starters, users),
    installRate: rate(installers, users),
    marginPerUser: rate(revenue - rewards, users),
  };
}

function summarize(rows: Row[], adSpend: Micros) {
  const inArm = (arm: Arm) => rows.filter((r) => r.arm === arm);
  const treated = inArm('treatment');
  const held = inArm('control');
  const t = armStats(treated);
  const c = armStats(held);
  const margins = (rs: Row[]) => rs.map((r) => r.revenue - r.rewards);
  const installs = (rs: Row[]) => rs.map((r) => (r.installed ? 1 : 0));
  const { profit, spendPerUser, ci95 } = profitPerTreatedUser(
    margins(treated),
    margins(held),
    adSpend,
  );
  // Credited installs per user, treatment minus control. A 0/1 outcome, so the same mean-difference CI is the two-proportion one.
  const installLift = meanDifference(installs(treated), installs(held));

  return {
    arms: { treatment: t, control: c },
    adSpend,
    incremental: {
      startRateLift: t.startRate - c.startRate,
      installLift: installLift.diff,
      installLiftCi95: installLift.ci95,
      marginPerUser: t.marginPerUser - c.marginPerUser,
      spendPerUser,
      profitPerUser: profit,
      profitPerUserCi95: ci95,
      totalProfit: profit * t.users,
      roas: adSpend ? ((t.marginPerUser - c.marginPerUser) * t.users) / adSpend : null,
    },
    // Decision rule fixed before the test: continue if the 95% CI's lower bound is above 0, stop
    // if the upper bound is below 0, else inconclusive; the data floor is in src/model/readout.ts.
    verdict: verdictFor(ci95, [t, c]),
  };
}
