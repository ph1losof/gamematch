/**
 * The simulated population for the demo: 66/34 Android/iOS (Appfigures counts ~21M Google Play vs
 * ~10M App Store downloads of Freecash,
 * https://web.archive.org/web/20260611150723/https://appfigures.com/resources/insights/freecash-tricked-tiktok-top-app-store),
 * a usable ad ID on 95% of Android (Singular: ~2% of devices zero theirs,
 * https://www.singular.net/blog/zeroing-out-the-android-advertising-id-will-impact-only-2-of-devices-globally/)
 * and 36% of iOS devices (which keeps the brief's 75% overall). 60% may be shown cross-app ads
 * and 80% are 18+: our placeholders, to ask Almedia.
 * Days since last linked-game progress are exponential with a 12-day mean: about 28% hot (≤3 days),
 * 43% warm (≤14) and 29% cold. 55% are linked to Kingdom Clash (strategy), 45% to Jewel Mania (puzzle).
 * Lifetime Link earnings are exponential with a $26 mean, so about 15% reach the $50 high-tier cut
 * (config.valueTierMinEarnings), the dashboard's default tier share. All are in the US.
 */
import { LINKED_GAME, LINKED_PUZZLE_GAME, type SeedUser } from '../src/seed';
import { usd } from '../src/shared/money';
import type { Platform } from '../src/shared/types';

const NAMES = [
  'Alex Kim',
  'Sam Rivera',
  'Jordan Lee',
  'Taylor Brooks',
  'Casey Morgan',
  'Riley Chen',
  'Jamie Patel',
  'Drew Santos',
];

/** Demo names, reused in turn. */
const nameFor = (i: number) => {
  const name = NAMES[i % NAMES.length];
  if (name === undefined) throw new Error('NAMES is empty');
  return name;
};

/** Deterministic users for a given RNG. */
export function generateUsers(count: number, rng: () => number): SeedUser[] {
  return Array.from({ length: count }, (_, i) => {
    const platform: Platform = rng() < 0.66 ? 'android' : 'ios';
    return {
      id: `usr_${String(i).padStart(6, '0')}`,
      name: nameFor(i),
      age: rng() < 0.8 ? 18 + Math.floor(rng() * 30) : 16 + Math.floor(rng() * 2),
      adsConsent: rng() < 0.6,
      platform,
      deviceId: fakeUuid(rng),
      trackingAllowed: rng() < (platform === 'android' ? 0.95 : 0.36),
      daysSinceActive: Math.floor(-Math.log(1 - rng()) * 12),
      linkedGameId: rng() < 0.55 ? LINKED_GAME.id : LINKED_PUZZLE_GAME.id,
      linkEarnings: usd(Math.round(-Math.log(1 - rng()) * 2600) / 100),
    };
  });
}

/** Small seeded PRNG (mulberry32), so demo runs are repeatable. */
export function seededRng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fakeUuid(rng: () => number) {
  const hex = Array.from({ length: 32 }, () => Math.floor(rng() * 16).toString(16)).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
}
