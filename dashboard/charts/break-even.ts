/**
 * What click-through or follow-on value breaks even? Profit per 1,000 over a CTR × follow-on grid.
 * Pure: (outputs, palette[, platform]) → ECharts option, plus the one-line answer under its title.
 */
import type { EChartsOption } from 'echarts';
import type { Outputs } from '../../src/model/scenario-types';
import type { Platform } from '../../src/shared/types';
import { money, pct, signedMoney } from '../format';
import { PLATFORM_NAME } from '../names';
import { toUsd } from '../units';
import { base, fin, LABEL, nth, one, type Palette } from './style';

const CTR_TICKS = [1, 2, 4, 6, 8];

/** Profit per 1,000 over CTR × follow-on value: loss and profit cells, today marked. */
export function breakEvenMapOption(o: Outputs, pal: Palette, focus: Platform): EChartsOption {
  const h = o.platforms[focus].heatmap;
  const xs = h.followOns.map((f) => toUsd(f));
  const ys = h.ctrs.map((c) => +(c * 100).toFixed(2));
  const half = (arr: number[]) => (arr.length > 1 ? (nth(arr, 1) - nth(arr, 0)) / 2 : 0.5);
  const last = (arr: number[]) => nth(arr, arr.length - 1);
  const now: [number, number] = [fin(toUsd(h.current.followOn)), fin(h.current.ctr * 100)];
  return {
    ...base(pal),
    grid: { left: 52, right: 16, top: 16, bottom: 40 },
    tooltip: {
      ...base(pal).tooltip,
      formatter: (p) => {
        const d = one(p);
        if (d.seriesType === 'scatter')
          return `Today: ${pct(h.current.ctr)} click-through, ${money(h.current.followOn)} follow-on`;
        const [ctrIndex, followOnIndex, profit] = nth(h.cells, d.dataIndex);
        return `${nth(ys, ctrIndex)}% click-through · ${money(nth(h.followOns, followOnIndex))} follow-on<br/>${signedMoney(fin(profit))} per 1,000 impressions`;
      },
    },
    xAxis: [
      {
        type: 'category',
        data: xs.map(String),
        name: 'follow-on value per activated user',
        nameLocation: 'middle',
        nameGap: 28,
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: {
          color: pal.muted,
          fontSize: LABEL,
          interval: 4,
          formatter: (v: string) => `$${v}`,
        },
        nameTextStyle: { color: pal.muted, fontSize: LABEL },
      },
      { type: 'value', show: false, min: nth(xs, 0) - half(xs), max: last(xs) + half(xs) },
    ],
    yAxis: [
      {
        type: 'category',
        data: ys.map(String),
        name: 'click-through rate',
        nameLocation: 'middle',
        nameGap: 36,
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: {
          color: pal.muted,
          fontSize: LABEL,
          interval: (_: number, v: string) => CTR_TICKS.includes(Number(v)),
          formatter: (v: string) => `${v}%`,
        },
        nameTextStyle: { color: pal.muted, fontSize: LABEL },
      },
      { type: 'value', show: false, min: nth(ys, 0) - half(ys), max: last(ys) + half(ys) },
    ],
    // Two tones only: loss or profit. ECharts colours heatmaps through a visualMap.
    visualMap: {
      type: 'piecewise',
      show: false,
      dimension: 2,
      seriesIndex: 0,
      pieces: [
        { lt: 0, color: pal.badFill },
        { gte: 0, color: pal.goodFill },
      ],
    },
    series: [
      {
        type: 'heatmap',
        data: h.cells.map(([i, j, v]) => [j, i, fin(toUsd(v))]),
        itemStyle: { borderColor: pal.page, borderWidth: 1 },
        emphasis: { itemStyle: { borderColor: pal.ink, borderWidth: 1 } },
      },
      {
        type: 'scatter',
        xAxisIndex: 1,
        yAxisIndex: 1,
        symbol: 'circle',
        symbolSize: 12,
        itemStyle: { color: 'transparent', borderColor: pal.ink, borderWidth: 2.5 },
        label: {
          show: true,
          position: 'right',
          color: pal.ink,
          fontSize: LABEL,
          formatter: 'today',
        },
        data: [now],
        z: 5,
      },
    ],
  };
}

export function breakEvenAnswer(o: Outputs, focus: Platform) {
  const r = o.platforms[focus];
  const fo =
    r.breakEvenFollowOn <= 0
      ? 'no follow-on value'
      : `${money(r.breakEvenFollowOn)} of follow-on per user`;
  const ctr =
    r.verdict.buyMode === 'cpm'
      ? `; at today's follow-on it needs ${pct(r.breakEvenCtr)} click-through`
      : '';
  return `${PLATFORM_NAME[focus]} at ${pct(r.heatmap.current.ctr)} click-through breaks even with ${fo}${ctr}.`;
}
