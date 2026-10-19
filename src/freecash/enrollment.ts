/**
 * Enrollment freezes who is in the test *before* any ad runs, splits them by a salted hash, and
 * records each user's segment, value tier and platform, so the control arm is the same kind of
 * user who simply gets no ads, within every stratum.
 */
import { and, eq, exists, notExists, sql } from 'drizzle-orm';
import { type Segment, segmentFor, type ValueTier } from '../model/segments';
import { DAY } from '../shared/clock';
import type { Micros } from '../shared/money';
import type { Platform } from '../shared/types';
import type { Config } from './config';
import type { Deps } from './deps';
import { mayTarget, targetableDevice } from './eligibility';
import { type Arm, devices, experimentMembers, links, offerStarts, users } from './schema';

/**
 * SQLite caps bound variables per statement (32,766); 6 columns × 1,000 rows stays well under it.
 */
const INSERT_BATCH = 1000;

/**
 * The user's arm: a salted hash of their ID, so it is stable and needs no stored randomness.
 * Bun.hash is wyhash; arms stay stable for as long as that hash does.
 */
export function armFor(salt: string, userId: string, holdoutPct: number): Arm {
  return BigInt(Bun.hash(`${salt}:${userId}`)) % 100n < BigInt(holdoutPct)
    ? 'control'
    : 'treatment';
}

const valueTierFor = (linkEarnings: Micros, minEarnings: Micros): ValueTier =>
  linkEarnings >= minEarnings ? 'high' : 'standard';

type Candidate = { id: string; linkEarnings: Micros; lastActiveAt: number; platform: Platform };

/** A candidate's membership row: arm, segment and tier, frozen now. */
const assignMember = (
  c: Candidate,
  now: number,
  config: Pick<Config, 'experimentSalt' | 'holdoutPct' | 'segmentDays' | 'valueTierMinEarnings'>,
) => ({
  userId: c.id,
  arm: armFor(config.experimentSalt, c.id, config.holdoutPct),
  segment: segmentFor((now - c.lastActiveAt) / DAY, config.segmentDays),
  valueTier: valueTierFor(c.linkEarnings, config.valueTierMinEarnings),
  platform: c.platform,
  enrolledAt: now,
});

/**
 * Eligible: a linked user who never started an offer, may be targeted (mayTarget), and has a
 * targetable device. Users without a usable ad ID can't be reached by device-ID ads at all, so
 * they're outside the test rather than in control. Enrolling again adds only new users.
 */
export function enroll({ db, clock, config }: Pick<Deps, 'db' | 'clock' | 'config'>) {
  const ownDevice = and(eq(devices.userId, users.id), targetableDevice(config));
  const candidates: Candidate[] = db
    .select({
      id: users.id,
      linkEarnings: users.linkEarnings,
      lastActiveAt: sql<number>`(select max(${links.lastActiveAt}) from ${links} where ${links.userId} = ${users.id})`,
      // The phone we'll target; seeded users have one, and a user with two is read by the first.
      platform: sql<Platform>`(select ${devices.platform} from ${devices} where ${ownDevice} order by ${devices.deviceId} limit 1)`,
    })
    .from(users)
    .where(
      and(
        exists(db.select().from(links).where(eq(links.userId, users.id))),
        notExists(db.select().from(offerStarts).where(eq(offerStarts.userId, users.id))),
        notExists(
          db.select().from(experimentMembers).where(eq(experimentMembers.userId, users.id)),
        ),
        mayTarget(config),
        exists(db.select().from(devices).where(ownDevice)),
      ),
    )
    .all();

  const now = clock.now();
  const members = candidates.map((c) => assignMember(c, now, config));
  db.transaction((tx) => {
    for (let i = 0; i < members.length; i += INSERT_BATCH)
      tx.insert(experimentMembers)
        .values(members.slice(i, i + INSERT_BATCH))
        .run();
  });

  const bySegment: Record<Segment, number> = { hot: 0, warm: 0, cold: 0 };
  const byTier: Record<ValueTier, number> = { high: 0, standard: 0 };
  const byArm: Record<Arm, number> = { treatment: 0, control: 0 };
  for (const m of members) {
    bySegment[m.segment]++;
    byTier[m.valueTier]++;
    byArm[m.arm]++;
  }
  return { ...byArm, bySegment, byTier };
}
