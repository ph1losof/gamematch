/** Advertising IDs (GAID on Android, IDFA on iOS) as every party in the flow sees them. */

export const ZERO_AD_ID = '00000000-0000-0000-0000-000000000000';

/**
 * Normalises a GAID/IDFA. Returns null for the zeroed ID (tracking off), an empty value,
 * or an unreplaced macro like `{IFA}`, because none of those identify a device.
 */
export function normalizeAdId(raw: string | null | undefined): string | null {
  const id = raw?.trim().toLowerCase();
  if (!id || id === ZERO_AD_ID || id.startsWith('{')) return null;
  return id;
}
