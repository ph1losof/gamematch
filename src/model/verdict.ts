/**
 * Does a platform work, and if not, which one lever flips it? Every branch is judged at one
 * price: today's bid, or the bid that wins the minimum share of requests if that is higher (a
 * profitable bid that barely delivers doesn't count; a Link Offers revenue share has no auction,
 * so its price is just its cost). From that price:
 * - GREEN when the blended value per 1,000 impressions covers it. If today's bid wins too little,
 *   the lever is just to bid the price ("bidHigher").
 * - Otherwise the follow-on value per activated user that would cover it: AMBER if that is inside
 *   the range we'd believe, RED if not. In CPM mode a higher CTR is the other lever; per start or
 *   on a revenue share the price scales with CTR, so CTR is not a lever.
 * A CPA bid at the value bid keeps the target margin, so there the value must cover
 * price / (1 − margin) for the network to pay the price. How much follow-on reaches a value is
 * the caller's to answer (scenario.ts re-blends segments for it), so this file stays arithmetic.
 */
import type { Micros } from '../shared/money';
import type { Platform } from '../shared/types';
import type { PlatformResult, PlatformVerdict, Scenario, Status } from './scenario-types';

/** What the verdict needs from a platform's segment blend. */
export type PlatformEconomics = {
  value1000: Micros;
  bid: Micros;
  winRate: number;
  ctr: number; // the platform's base CTR
  /** Follow-on value per activated user at which value per 1,000 impressions reaches `target1000`. */
  followOnToReach: (target1000: Micros) => Micros;
};

/** Inverse of winRate(): the exchange bid that wins share `w` of requests (Infinity at or above the max share). */
export function bidForWinRate(
  w: number,
  medianClearing: Micros,
  maxShare = 0.8,
  steepness = 2.5,
): Micros {
  if (w <= 0) return 0;
  if (w >= maxShare) return Infinity;
  return medianClearing * (w / (maxShare - w)) ** (1 / steepness);
}

export function platformVerdict(
  s: Pick<Scenario, 'market' | 'followOn'>,
  p: Platform,
  e: PlatformEconomics,
): PlatformVerdict {
  const m = s.market;
  // What we'd have to pay for the exchange bid that wins minWinRate: grossed back up by the platform fee.
  const deliverable =
    m.buyMode === 'revShare'
      ? 0
      : bidForWinRate(
          m.minWinRate,
          m.medianClearing[m.region][p],
          m.winCurve.maxShare,
          m.winCurve.steepness,
        ) /
        (1 - m.platformFee);
  const price = Math.max(e.bid, deliverable);
  const valueNeeded = m.buyMode === 'cpa' && m.cpaAuto ? price / (1 - m.targetMargin) : price;
  const base = {
    profit1000: e.value1000 - e.bid,
    bid: e.bid,
    price,
    winRate: e.winRate,
    minWinRate: m.minWinRate,
    followOnCeiling: s.followOn.ceiling,
    horizon: s.followOn.horizon,
    buyMode: m.buyMode,
  };
  if (e.value1000 >= valueNeeded) {
    const reason = e.winRate >= m.minWinRate ? 'profitable' : 'bidHigher';
    return { ...base, status: 'green', reason, followOnNeeded: 0, ctrNeeded: null };
  }
  const followOnNeeded = e.followOnToReach(valueNeeded);
  const believable = followOnNeeded <= s.followOn.ceiling;
  // Value per 1,000 is proportional to CTR (until a segment's CTR caps at 100%), so the CTR that
  // pays the price scales with it. In CPA mode the price scales with CTR too, so it can't close the gap.
  const ctrNeeded =
    m.buyMode === 'cpm' && e.value1000 > 0 ? (e.ctr * valueNeeded) / e.value1000 : null;
  return {
    ...base,
    status: believable ? 'amber' : 'red',
    reason: believable ? 'needsFollowOn' : 'needsMore',
    followOnNeeded,
    ctrNeeded,
  };
}

const RANK: Record<Status, number> = { red: 0, amber: 1, green: 2 };

export type OverallVerdict = { status: Status; platform: Platform };

/** The page's verdict is the best platform's: the better status, then the higher profit (Android on a tie). */
export function overallVerdict(platforms: Record<Platform, PlatformResult>): OverallVerdict {
  const { android, ios } = platforms;
  const rankGap = RANK[ios.verdict.status] - RANK[android.verdict.status];
  const iosLeads = rankGap > 0 || (rankGap === 0 && ios.profit1000 > android.profit1000);
  const best = iosLeads ? ios : android;
  return { status: best.verdict.status, platform: best.platform };
}
