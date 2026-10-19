/**
 * How many users can we reach? Users left after each gate, stacked by platform.
 * Pure: (outputs, palette[, platform]) → ECharts option, plus the one-line answer under its title.
 */
import type { EChartsOption } from 'echarts';
import type { Outputs } from '../../src/model/scenario-types';
import { PLATFORMS } from '../../src/shared/types';
import { compactNum } from '../format';
import { PLATFORM_NAME } from '../names';
import {
  barFill,
  base,
  categoryAxis,
  fin,
  hover,
  LABEL,
  nth,
  type Palette,
  ROUND,
  valueAxis,
} from './style';

const POOL_LABEL: ReadonlyMap<string, string> = new Map([
  ['linked', 'Linked users'],
  ['usableId', 'With an ad ID'],
  ['consent', 'Consented to ads'],
  ['adults', 'Adults (18+)'],
  ['inTest', 'In test regions'],
  ['segments', 'In targeted segments'],
  ['tier', 'In the high-value tier'],
]);

/** A step's display name: the short label for a known gate, else the model's own label. */
export const poolLabel = (s: { key: string; label: string }) => POOL_LABEL.get(s.key) ?? s.label;

/** Users left after each gate, stacked by platform, totals at the bar ends. */
export function poolOption(o: Outputs, pal: Palette): EChartsOption {
  const steps = o.pool;
  return {
    ...base(pal),
    grid: { left: 8, right: 56, top: 8, bottom: 8, containLabel: true },
    tooltip: {
      ...base(pal).tooltip,
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      valueFormatter: (v) => compactNum(Number(v)),
    },
    xAxis: {
      type: 'value',
      ...valueAxis(pal),
      axisLabel: { ...valueAxis(pal).axisLabel, formatter: (v: number) => compactNum(v) },
    },
    yAxis: {
      ...categoryAxis(pal, steps.map(poolLabel)),
      inverse: true,
      axisLabel: { color: pal.ink2, fontSize: LABEL },
    },
    series: PLATFORMS.map((p, k) => ({
      type: 'bar' as const,
      name: PLATFORM_NAME[p],
      stack: 'pool',
      color: barFill(pal.series[p]),
      barMaxWidth: 14,
      emphasis: hover(pal),
      itemStyle: { borderRadius: k === PLATFORMS.length - 1 ? ROUND : 0 },
      data: steps.map((s) => fin(s.users[p])),
      label:
        k === PLATFORMS.length - 1
          ? {
              show: true,
              position: 'right' as const,
              color: pal.ink,
              fontSize: LABEL,
              formatter: (d: { dataIndex: number }) => compactNum(nth(steps, d.dataIndex).total),
            }
          : undefined,
    })),
  };
}

export function poolAnswer(o: Outputs) {
  const enrollable = o.sizing.enrollable;
  if (!(enrollable > 0)) return 'No users in the test: turn on a test region or a segment.';
  const reached = nth(o.pool, o.pool.length - 1);
  return `${compactNum(enrollable)} users can be enrolled; ${compactNum(reached.total)} are reachable in the test window (Android ${compactNum(reached.users.android)} in sky blue, iOS ${compactNum(reached.users.ios)} in violet).`;
}
