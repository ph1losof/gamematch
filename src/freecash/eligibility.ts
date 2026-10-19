/**
 * Who we may show ads to, as SQL predicates so they filter in the database at a million users.
 * Enrollment checks them once; every audience sync (audiences.ts) checks them again, so a
 * withdrawal, a corrected birth date or a move abroad takes the user out of the next upload.
 */
import { and, eq, gte, inArray } from 'drizzle-orm';
import type { Config } from './config';
import { devices, users } from './schema';

/** Old enough, consented to cross-app ads (when required) and in a test country. */
export const mayTarget = (config: Pick<Config, 'minAge' | 'requireAdsConsent' | 'countries'>) =>
  and(
    gte(users.age, config.minAge),
    config.requireAdsConsent ? eq(users.adsConsent, true) : undefined,
    inArray(users.country, config.countries),
  );

/** A device device-ID ads can reach: tracking allowed, on a platform we run. */
export const targetableDevice = (config: Pick<Config, 'platforms'>) =>
  and(eq(devices.trackingAllowed, true), inArray(devices.platform, config.platforms));
