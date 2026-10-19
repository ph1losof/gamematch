/**
 * Inputs that are legal one at a time but contradict each other, as plain sentences. They are
 * diagnostics about the inputs, not judgements about the case.
 */
import { LIST_REACH_DAYS } from './population';
import type { Scenario } from './scenario-types';
import { SEGMENTS } from './segments';

const pctText = (x: number) => `${+(x * 100).toFixed(1)}%`;

export function issuesFor(s: Scenario, geoValid: boolean): string[] {
  const issues: string[] = [];
  const { days } = s.segments;
  const m = s.market;
  if (!geoValid) {
    const rest = 1 - s.population.geoShare.us - s.population.geoShare.eu;
    issues.push(
      `US + EU shares exceed 100%: rest of world would be ${pctText(rest)}. Treated as 0%.`,
    );
  }
  if (!SEGMENTS.some((k) => s.segments.target[k]))
    issues.push(
      'No segment is targeted: the blend falls back to all segments and the pool is empty.',
    );
  if (!Object.values(s.population.inTest).some(Boolean))
    issues.push('No geo is in the test: the pool is empty.');
  if (!s.offer.goals.some((g) => g.enabled))
    issues.push('Every offer goal is disabled: margin per install is $0.');
  if (days.hot >= days.warm)
    issues.push(
      `Hot is ≤${days.hot} days but warm is ≤${days.warm} days: hot must be the shorter window, so the segment labels contradict.`,
    );
  if (m.minWinRate >= m.winCurve.maxShare)
    issues.push(
      `Min win rate ${pctText(m.minWinRate)} is at or above the ${pctText(m.winCurve.maxShare)} max share won: no bid delivers it.`,
    );
  if (m.testDays !== LIST_REACH_DAYS)
    issues.push(
      `The test runs ${m.testDays} days but list reach is a ${LIST_REACH_DAYS}-day figure: impressions scale with test days, reach doesn't.`,
    );
  return issues;
}
