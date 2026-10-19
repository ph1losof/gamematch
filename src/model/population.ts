/**
 * Who the paid channel can reach. The 1M linked users shrink at each legal or technical gate:
 * a usable ad ID (per OS), consent to cross-app ads (per geo: the US is opt-out, the EU opt-in),
 * adults only, the geos the test runs in, the segments we target, the value tier if only high past
 * earners are targeted. Who is left can be enrolled. Last comes list reach: the share of those
 * users a campaign actually reaches in 14 days (our estimate; see LIST_REACH_14D). Geo is assumed
 * independent of OS. These gates set the size of the prize, never the profit per impression.
 */
import type { Platform } from '../shared/types';
import { byPlatform, sumPlatforms } from './records';
import { SEGMENTS, type Segment } from './segments';

/** List reach (LIST_REACH_14D) is measured over this many days, whatever the test length. */
export const LIST_REACH_DAYS = 14;

const GEOS = ['us', 'eu', 'row'] as const;
export type Geo = (typeof GEOS)[number];

export type Population = {
  linkedUsers: number;
  androidShare: number;
  usableId: Record<Platform, number>;
  /** US and EU shares of linked users; the rest of the world is the remainder. */
  geoShare: { us: number; eu: number };
  consent: Record<Geo, number>;
  adults: number;
  inTest: Record<Geo, boolean>;
  listReach: Record<Platform, number>;
};

export type PoolStep = {
  key: string;
  label: string;
  users: Record<Platform, number>;
  total: number;
};

/** Every gate's step, then who can be enrolled (before list reach) and who is reached. */
export type Pool = {
  steps: PoolStep[];
  enrollable: Record<Platform, number>;
  reached: Record<Platform, number>;
};

/** A gate keeps `share(platform)` of the users before it. */
type Gate = { key: string; label: string; share: (pl: Platform) => number };

export type GeoSplit = { shares: Record<Geo, number>; valid: boolean };

/** Geo shares with the remainder, and whether US + EU overflowed 100%. */
export function geoShares(p: Population): GeoSplit {
  const row = 1 - p.geoShare.us - p.geoShare.eu;
  return {
    shares: { us: p.geoShare.us, eu: p.geoShare.eu, row: Math.max(0, row) },
    valid: row >= -1e-9,
  };
}

const stepOf = (key: string, label: string, users: Record<Platform, number>): PoolStep => ({
  key,
  label,
  users,
  total: sumPlatforms((pl) => users[pl]),
});

/**
 * Users left after each gate, per platform. `segmentShare` is the targeted share of users
 * (segment shares are normalised to sum to 1 first). `highTierShare` adds the value-tier gate when
 * only the high tier is targeted.
 */
export function eligiblePool(
  p: Population,
  segmentShare: Record<Segment, number>,
  target: Record<Segment, boolean>,
  highTierShare?: number,
): Pool {
  const { shares } = geoShares(p);
  const consented = GEOS.reduce((s, g) => s + shares[g] * p.consent[g], 0);
  const consentedInTest = GEOS.reduce(
    (s, g) => s + (p.inTest[g] ? shares[g] * p.consent[g] : 0),
    0,
  );
  const testShare = consented > 0 ? consentedInTest / consented : 0;
  const shareSum = SEGMENTS.reduce((s, k) => s + segmentShare[k], 0);
  const targeted =
    shareSum > 0
      ? SEGMENTS.reduce((s, k) => s + (target[k] ? segmentShare[k] : 0), 0) / shareSum
      : 0;

  const split: Record<Platform, number> = { android: p.androidShare, ios: 1 - p.androidShare };
  const gates: Gate[] = [
    { key: 'linked', label: 'Linked users', share: (pl) => split[pl] },
    { key: 'usableId', label: 'Usable ad ID', share: (pl) => p.usableId[pl] },
    { key: 'consent', label: 'Consent to cross-app ads', share: () => consented },
    { key: 'adults', label: 'Adults (18+)', share: () => p.adults },
    { key: 'inTest', label: 'In test geos', share: () => testShare },
    { key: 'segments', label: 'In target segments', share: () => targeted },
  ];
  if (highTierShare !== undefined)
    gates.push({ key: 'tier', label: 'In the high-value tier', share: () => highTierShare });

  const steps: PoolStep[] = [];
  let users = byPlatform(() => p.linkedUsers);
  for (const gate of gates) {
    const before = users;
    users = byPlatform((pl) => before[pl] * gate.share(pl));
    steps.push(stepOf(gate.key, gate.label, users));
  }
  const enrollable = users;
  const reached = byPlatform((pl) => enrollable[pl] * p.listReach[pl]);
  steps.push(stepOf('reached', `Reached in ${LIST_REACH_DAYS} days`, reached));
  return { steps, enrollable, reached };
}
