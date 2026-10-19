/**
 * The experiment readout's statistics: difference in mean margin per user between arms, minus
 * ad spend per treated user, with a normal-approximation 95% CI and a pre-registered verdict.
 * The backend readout and the dashboard's sizing panel share it.
 */

export type Verdict = 'continue' | 'stop' | 'inconclusive' | 'insufficient';
/** A confidence interval: [low, high]. */
export type Interval = [number, number];

/** The two-sided 95% normal quantile. */
const Z_95 = 1.96;

export function variance(xs: number[]) {
  if (xs.length < 2) return 0;
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
  return xs.reduce((s, x) => s + (x - mean) ** 2, 0) / (xs.length - 1);
}

/**
 * Treatment mean minus control mean, with a normal-approximation 95% CI. The spread is pooled over
 * both arms (the classic two-sample test, and what sizing.ts assumes: one SD for both arms). Margin
 * per user has a heavy right tail, and the small control arm often holds none of the rare deep-goal
 * earners, so its own sample variance understates its spread and the CI's lower end sits too high.
 * scripts/calibrate.ts showed it: with each arm's own variance, a world where ads do nothing read
 * "continue" in 4% of runs at 20k simulated users and 12.5% at 10k, not the promised 2.5%; pooled,
 * in none. Pooling errs toward "inconclusive" when the ad adds spread to treatment, the usual case.
 */
export function meanDifference(treatment: number[], control: number[]) {
  const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
  const diff = mean(treatment) - mean(control);
  const [nt, nc] = [treatment.length, control.length];
  const pooled =
    nt + nc > 2
      ? ((nt - 1) * variance(treatment) + (nc - 1) * variance(control)) / (nt + nc - 2)
      : 0;
  const se = Math.sqrt(pooled * (1 / Math.max(nt, 1) + 1 / Math.max(nc, 1)));
  const ci95: Interval = [diff - Z_95 * se, diff + Z_95 * se];
  return { diff, ci95 };
}

/**
 * Incremental profit per treated user and its 95% CI. Spend is a constant per treated user,
 * so it shifts the mean without changing the variance.
 */
export function profitPerTreatedUser(treatment: number[], control: number[], adSpend: number) {
  const spendPerUser = treatment.length ? adSpend / treatment.length : 0;
  const { diff, ci95 } = meanDifference(treatment, control);
  const profitCi: Interval = [ci95[0] - spendPerUser, ci95[1] - spendPerUser];
  return { profit: diff - spendPerUser, spendPerUser, ci95: profitCi };
}

/**
 * The least data an arm needs before its normal-approximation CI means anything. Margin per user
 * is mostly zeros with a heavy tail, so what carries the information is how many users converted:
 * at least 10 per arm and at least 30 users, common rules of thumb for treating a count and a
 * sample mean as normal (our choice). With fewer, a sample variance near zero gives a CI far
 * narrower than the truth: one converter and an empty control read as a certain "continue".
 */
export const MIN_PER_ARM = { users: 30, converters: 10 };
export type ArmCounts = { users: number; converters: number };
const hasEnoughData = (a: ArmCounts) =>
  a.users >= MIN_PER_ARM.users && a.converters >= MIN_PER_ARM.converters;

/**
 * Continue only if we're confident the channel makes money; stop if we're confident it doesn't;
 * insufficient (no decision either way) while any arm is below MIN_PER_ARM.
 */
export const verdictFor = ([low, high]: Interval, arms: ArmCounts[]): Verdict =>
  !arms.every(hasEnoughData)
    ? 'insufficient'
    : low > 0
      ? 'continue'
      : high < 0
        ? 'stop'
        : 'inconclusive';
