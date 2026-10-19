/**
 * Where do 1,000 impressions go? The model's per-1,000 funnel for each platform: clicks, offer
 * starts, installs, the installs the ad caused, and those credited and paid. A log axis, because
 * each step keeps a small share of the one before. Pure: (outputs, palette) → ECharts option.
 */
import type { EChartsOption } from 'echarts';
import type { Funnel1000, Outputs } from '../../src/model/scenario-types';
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

const STEPS: { key: keyof Funnel1000; label: string }[] = [
  { key: 'impressions', label: 'Impressions' },
  { key: 'clicks', label: 'Clicks' },
  { key: 'starts', label: 'Offer starts' },
  { key: 'installs', label: 'Installs' },
  { key: 'incremental', label: 'Caused by the ad' },
  { key: 'credited', label: 'Credited and paid' },
];

/** A log axis has no zero: a step that reaches nobody is left empty. */
const onLog = (x: number) => (fin(x) > 0 ? fin(x) : null);

/** Per platform, the count left at each step of 1,000 impressions, on a log axis. */
export function impressionsOption(o: Outputs, pal: Palette): EChartsOption {
  return {
    ...base(pal),
    grid: { left: 8, right: 56, top: 8, bottom: 32, containLabel: true },
    tooltip: {
      ...base(pal).tooltip,
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      valueFormatter: (v) => `${compactNum(Number(v))} per 1,000 impressions`,
    },
    xAxis: {
      type: 'log',
      logBase: 10,
      ...valueAxis(pal),
      axisLabel: { ...valueAxis(pal).axisLabel, formatter: (v: number) => compactNum(v) },
      name: 'count per 1,000 impressions (log scale)',
      nameLocation: 'middle',
      nameGap: 26,
    },
    yAxis: {
      ...categoryAxis(
        pal,
        STEPS.map((s) => s.label),
      ),
      inverse: true,
      axisLabel: { color: pal.ink2, fontSize: LABEL },
    },
    series: PLATFORMS.map((p) => ({
      type: 'bar' as const,
      name: PLATFORM_NAME[p],
      barMaxWidth: 10,
      barGap: '30%',
      emphasis: hover(pal),
      itemStyle: { color: barFill(pal.series[p]), borderRadius: ROUND },
      data: STEPS.map((s) => onLog(o.platforms[p].funnel1000[s.key])),
      label: {
        show: true,
        position: 'right' as const,
        color: pal.series[p],
        fontSize: LABEL - 2,
        formatter: (d: { dataIndex: number }) => {
          const v = onLog(o.platforms[p].funnel1000[nth(STEPS, d.dataIndex).key]);
          return v === null ? '' : compactNum(v);
        },
      },
    })),
  };
}

export const impressionsAnswer = (o: Outputs) =>
  `Of 1,000 impressions, ${PLATFORMS.map(
    (p) =>
      `${PLATFORM_NAME[p]} ends with ${compactNum(o.platforms[p].funnel1000.credited)} credited installs`,
  ).join(' and ')}.`;
