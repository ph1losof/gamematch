/**
 * Records with one entry per platform or per segment, built by calling a function for each key.
 * Spelling the keys out keeps the record's type exact, where Object.fromEntries would need a cast.
 */
import type { Platform } from '../shared/types';
import type { Segment } from './segments';

export const byPlatform = <T>(f: (p: Platform) => T): Record<Platform, T> => ({
  android: f('android'),
  ios: f('ios'),
});

export const bySegment = <T>(f: (seg: Segment) => T): Record<Segment, T> => ({
  hot: f('hot'),
  warm: f('warm'),
  cold: f('cold'),
});

/** Σ f(key) over every segment. */
export const sumSegments = (f: (seg: Segment) => number): number =>
  f('hot') + f('warm') + f('cold');

/** Σ f(key) over every platform. */
export const sumPlatforms = (f: (p: Platform) => number): number => f('android') + f('ios');
