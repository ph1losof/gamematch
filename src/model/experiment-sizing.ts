/**
 * Sizing the holdout test from the platform results: how many users the budget enrols, what that
 * spends, the smallest effect it can detect, and how many users (and dollars) the expected effect
 * would need. The statistics live in sizing.ts; this module only feeds them the scenario's numbers.
 */
import type { Platform } from '../shared/types';
import { sumPlatforms } from './records';
import type { PlatformResult, Scenario, Sizing } from './scenario-types';
import { mde, power, sampleSize } from './sizing';
import { logspace } from './sweeps';

/** The MDE curve's x-axis: enrolled users from 1,000 to 10M, log-spaced. Display only. */
const CURVE_ENROLLED = [1_000, 10_000_000, 49] as const;

/** Fewest enrolled users for which two arms both exist. */
const MIN_ENROLLED = 2;

export function experimentSizing(s: Scenario, platforms: Record<Platform, PlatformResult>): Sizing {
  const { holdoutPct, sd, alpha, budget } = s.experiment;
  const enrollable = sumPlatforms((p) => platforms[p].enrollable);
  /** A per-treated-user figure, averaged over platforms by who can be enrolled. */
  const perTreated = (f: (r: PlatformResult) => number) =>
    enrollable > 0
      ? sumPlatforms((p) => platforms[p].enrollable * f(platforms[p])) / enrollable
      : 0;
  const spendPerTreatedUser = perTreated((r) => r.perTreatedUser.spend);
  const effect = perTreated((r) => r.perTreatedUser.profit);
  const treatedShare = 1 - holdoutPct / 100;
  const enrolledByBudget =
    spendPerTreatedUser > 0 ? budget / spendPerTreatedUser / treatedShare : Infinity;
  const enrolled = Math.min(enrolledByBudget, enrollable);
  const sized = enrolled >= MIN_ENROLLED;
  const mdeAt = (n: number) =>
    mde({ sd, enrolled: n, holdoutPct, alpha, power: s.experiment.power });
  const testMde = sized ? mdeAt(enrolled) : Infinity;
  const enrolledNeeded = sampleSize({
    sd,
    effect: Math.abs(effect),
    holdoutPct,
    alpha,
    power: s.experiment.power,
  });
  return {
    spendPerTreatedUser,
    effect,
    effectSize: Math.abs(effect),
    enrollable,
    enrolledByBudget,
    enrolled,
    budgetBinds: enrolledByBudget < enrollable,
    spent: enrolled * treatedShare * spendPerTreatedUser,
    mde: testMde,
    power: sized ? power({ sd, effect, enrolled, holdoutPct, alpha }) : 0,
    detectable: sized && Math.abs(effect) >= testMde,
    enrolledNeeded,
    // With no spend per user the test costs nothing (and Infinity × 0 would be NaN).
    budgetNeeded: spendPerTreatedUser > 0 ? enrolledNeeded * treatedShare * spendPerTreatedUser : 0,
    activations: enrolled * treatedShare * perTreated((r) => r.perTreatedUser.activations),
    curve: logspace(...CURVE_ENROLLED).map((n) => ({ enrolled: n, mde: mdeAt(n) })),
  };
}
