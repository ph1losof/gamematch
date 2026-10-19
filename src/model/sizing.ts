/**
 * Size the live test before ads run. The dashboard and the readout share this model so planning
 * uses the same two-arm uncertainty as the incremental profit decision.
 */

/** Acklam's inverse standard normal CDF, including rational approximations for both tails. */
export function zFor(p: number): number {
  if (!(p > 0 && p < 1)) throw new RangeError('p must be between 0 and 1');

  if (p < 0.02425 || p > 1 - 0.02425) {
    const q = Math.sqrt(-2 * (p < 0.02425 ? Math.log(p) : Math.log1p(-p)));
    const tail =
      (((((-0.007784894002430293 * q - 0.3223964580411365) * q - 2.400758277161838) * q -
        2.549732539343734) *
        q +
        4.374664141464968) *
        q +
        2.938163982698783) /
      ((((0.007784695709041462 * q + 0.3224671290700398) * q + 2.445134137142996) * q +
        3.754408661907416) *
        q +
        1);
    return p < 0.02425 ? tail : -tail;
  }

  const q = p - 0.5;
  const r = q * q;
  return (
    ((((((-39.69683028665376 * r + 220.9460984245205) * r - 275.9285104469687) * r +
      138.357751867269) *
      r -
      30.66479806614716) *
      r +
      2.506628277459239) *
      q) /
    (((((-54.47609879822406 * r + 161.5858368580409) * r - 155.6989798598866) * r +
      66.80131188771972) *
      r -
      13.28068155288572) *
      r +
      1)
  );
}

/** Standard normal CDF; the tail approximation has absolute error below 8e-8. */
export function normalCdf(x: number): number {
  if (x === 0) return 0.5;
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const tail =
    (Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI)) *
    t *
    (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x < 0 ? tail : 1 - tail;
}

export function standardError(
  sdTreatment: number,
  sdControl: number,
  nTreatment: number,
  nControl: number,
): number {
  if (
    !(nTreatment > 0 && Number.isFinite(nTreatment) && nControl > 0 && Number.isFinite(nControl))
  ) {
    throw new RangeError('arm sizes must be finite and positive');
  }
  return Math.sqrt(sdTreatment ** 2 / nTreatment + sdControl ** 2 / nControl);
}

type SizingOptions = { sd: number; holdoutPct: number; alpha?: number; sdControl?: number };

export function mde({
  sd,
  enrolled,
  holdoutPct,
  alpha = 0.05,
  power = 0.8,
  sdControl = sd,
}: SizingOptions & { enrolled: number; power?: number }): number {
  const se = enrolledError(sd, sdControl, enrolled, holdoutPct);
  return (zFor(1 - alpha / 2) + zFor(power)) * se;
}

export function sampleSize({
  sd,
  effect,
  holdoutPct,
  alpha = 0.05,
  power = 0.8,
  sdControl = sd,
}: SizingOptions & { effect: number; power?: number }): number {
  const se = enrolledError(sd, sdControl, 1, holdoutPct);
  if (effect <= 0) return Infinity;
  const z = zFor(1 - alpha / 2) + zFor(power);
  return Math.max(1, Math.ceil(((z * se) / effect) ** 2));
}

export function power({
  sd,
  effect,
  enrolled,
  holdoutPct,
  alpha = 0.05,
  sdControl = sd,
}: SizingOptions & { effect: number; enrolled: number }): number {
  const se = enrolledError(sd, sdControl, enrolled, holdoutPct);
  const critical = zFor(1 - alpha / 2);
  if (se === 0) return effect === 0 ? alpha : 1;
  const shift = Math.abs(effect) / se;
  // Either tail rejects the two-sided null, including the tail opposite the true effect.
  return normalCdf(shift - critical) + normalCdf(-shift - critical);
}

function enrolledError(
  sd: number,
  sdControl: number,
  enrolled: number,
  holdoutPct: number,
): number {
  if (!(holdoutPct > 0 && holdoutPct < 100))
    throw new RangeError('holdoutPct must be between 0 and 100');
  if (!(enrolled > 0 && Number.isFinite(enrolled)))
    throw new RangeError('enrolled must be finite and positive');
  const h = holdoutPct / 100;
  return standardError(sd, sdControl, enrolled * (1 - h), enrolled * h);
}
