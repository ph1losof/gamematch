/**
 * Display names: a platform's name, and a lower-case label capitalised for a heading or the rail.
 */
import type { Platform } from '../src/shared/types';

export const PLATFORM_NAME: Record<Platform, string> = { android: 'Android', ios: 'iOS' };

/** "click-through rate" → "Click-through rate"; names like "iOS" stay as written. */
export const cap = (s: string) =>
  /^[a-z][A-Z]/.test(s) ? s : s.charAt(0).toUpperCase() + s.slice(1);
