/** Small domain types every party shares: the platforms and an ad creative. */
export const PLATFORMS = ['android', 'ios'] as const;
export type Platform = (typeof PLATFORMS)[number];

export type Creative = { headline: string; body: string; cta: string };
