/**
 * The prize: what treating the whole enrollable pool, with no holdout, for one test-length wave
 * would earn across both platforms, at today's bid and at the profit-maximising bid.
 */
import type { Platform } from '../shared/types';
import { sumPlatforms } from './records';
import type { Haul, PlatformResult, Prize } from './scenario-types';

const total = (
  platforms: Record<Platform, PlatformResult>,
  f: (r: PlatformResult) => Haul,
): Haul => ({
  profit: sumPlatforms((p) => f(platforms[p]).profit),
  activations: sumPlatforms((p) => f(platforms[p]).activations),
});

export const prizeFor = (platforms: Record<Platform, PlatformResult>): Prize => ({
  atBid: total(platforms, (r) => ({
    profit: r.enrollable * r.perTreatedUser.profit,
    activations: r.enrollable * r.perTreatedUser.activations,
  })),
  atOptimal: total(platforms, (r) => ({
    profit: r.optimal.campaignProfit,
    activations: r.optimal.activations,
  })),
});
