/**
 * Which input moves profit most? One input at a time between its conservative and upside values.
 * Pure: (outputs, palette[, platform]) → ECharts option, plus the one-line answer under its title.
 */
import type { EChartsOption } from 'echarts';
import type { Outputs } from '../../src/model/scenario-types';
import type { Platform } from '../../src/shared/types';
import { signedMoney } from '../format';
import { cap, PLATFORM_NAME } from '../names';
import { toUsd } from '../units';
import {
  barFill,
  base,
  categoryAxis,
  hover,
  LABEL,
  nth,
  one,
  type Palette,
  ROUND,
  ROUND_LEFT,
  tint,
  valueAxis,
} from './style';

const TORNADO_BARS = 8;

/** Bars, biggest swing at the top: does this end of the input's range cross break-even? */
const crosses = (baseProfit: number, end: number) => (baseProfit < 0 ? end > 0 : end < 0);

/** One input at a time between its conservative and upside values: profit per 1,000. */
export function tornadoOption(o: Outputs, pal: Palette, focus: Platform): EChartsOption {
  const t = o.platforms[focus].tornado;
  const bars = t.bars.slice(0, TORNADO_BARS).reverse(); // biggest at the top
  const b0 = toUsd(t.base);
  const ends = bars.flatMap((b) => [toUsd(b.lowDelta), toUsd(b.highDelta)]);
  // Deltas are drawn from today's profit; break-even sits at −base. Both must be on the axis.
  const lo = Math.min(0, -b0, ...ends);
  const hi = Math.max(0, -b0, ...ends);
  const pad = Math.max(1, (hi - lo) * 0.2); // room for the end labels
  const colour = (end: number) =>
    crosses(t.base, end) ? (end > 0 ? pal.good : pal.bad) : pal.neutral;
  const item = (delta: number, end: number, text: string) => ({
    value: toUsd(delta),
    itemStyle: {
      color: barFill(colour(end), delta < 0 ? 'left' : 'right'),
      borderRadius: delta < 0 ? ROUND_LEFT : ROUND,
    },
    label: {
      show: delta !== 0,
      position: delta < 0 ? ('left' as const) : ('right' as const),
      color: pal.ink2,
      fontSize: LABEL,
      formatter: text,
    },
  });
  return {
    ...base(pal),
    grid: { left: 8, right: 96, top: 48, bottom: 36, containLabel: true },
    tooltip: {
      ...base(pal).tooltip,
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (p) => {
        const b = nth(bars, one(p).dataIndex);
        return `${cap(b.label)}<br/>${b.lowText}: ${signedMoney(b.low)} per 1,000<br/>${b.highText}: ${signedMoney(b.high)} per 1,000`;
      },
    },
    xAxis: {
      type: 'value',
      min: lo - pad,
      max: hi + pad,
      name: 'profit per 1,000 impressions',
      nameLocation: 'middle',
      nameGap: 28,
      ...valueAxis(pal),
      axisLabel: {
        ...valueAxis(pal).axisLabel,
        formatter: (v: number) => signedMoney((b0 + v) * 1e6, 0),
      },
    },
    yAxis: {
      ...categoryAxis(
        pal,
        bars.map((b) => cap(b.label)),
      ),
      axisLabel: { color: pal.ink2, fontSize: LABEL },
    },
    series: [
      {
        type: 'bar',
        name: 'Conservative',
        stack: 't',
        barMaxWidth: 16,
        emphasis: hover(pal),
        data: bars.map((b) => item(b.lowDelta, b.low, b.lowText)),
        // Faint teal/coral bands either side of break-even: profit above zero, loss below.
        markArea: {
          silent: true,
          data: [
            [{ xAxis: lo - pad, itemStyle: { color: tint(pal.bad, 0.07) } }, { xAxis: -b0 }],
            [{ xAxis: -b0, itemStyle: { color: tint(pal.good, 0.07) } }, { xAxis: hi + pad }],
          ],
        },
        markLine: {
          symbol: 'none',
          silent: true,
          data: [
            {
              xAxis: -b0,
              lineStyle: { color: pal.ink, width: 1.5, type: 'solid' as const },
              label: {
                formatter: 'break-even',
                position: 'end' as const,
                color: pal.ink,
                fontSize: LABEL,
              },
            },
            {
              xAxis: 0,
              lineStyle: { color: pal.ink2, width: 1, type: 'dashed' as const },
              label: {
                formatter: `today ${signedMoney(t.base)}`,
                position: 'end' as const,
                distance: 22,
                color: pal.ink2,
                fontSize: LABEL,
              },
            },
          ],
        },
      },
      {
        type: 'bar',
        name: 'Upside',
        stack: 't',
        barMaxWidth: 16,
        emphasis: hover(pal),
        data: bars.map((b) => item(b.highDelta, b.high, b.highText)),
      },
    ],
  };
}

export function tornadoAnswer(o: Outputs, focus: Platform) {
  const t = o.platforms[focus].tornado;
  const name = PLATFORM_NAME[focus];
  const top = t.bars[0];
  if (!top) return `No input in its range moves ${name} profit per 1,000.`;
  const flips = t.bars
    .slice(0, TORNADO_BARS)
    .filter((b) => crosses(t.base, b.low) || crosses(t.base, b.high));
  const list = flips.map((b) => b.label);
  const crossing = list.length
    ? `${list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list.at(-1)}` : list[0]} cross break-even on their own`
    : 'no single input crosses break-even on its own';
  return `${cap(top.label)} moves ${name} profit most; ${crossing}.`;
}
