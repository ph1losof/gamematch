/**
 * What is an activated user worth? First-offer value plus follow-on value, against what one costs.
 * Pure: (outputs, palette[, platform]) → ECharts option, plus the one-line answer under its title.
 */
import type { EChartsOption } from 'echarts';
import type { Outputs } from '../../src/model/scenario-types';
import { PLATFORMS } from '../../src/shared/types';
import { money } from '../format';
import { PLATFORM_NAME } from '../names';
import { toUsd } from '../units';
import {
  barFill,
  base,
  categoryAxis,
  connector,
  fin,
  hover,
  LABEL,
  nth,
  type Palette,
  platformCats,
  ROUND,
  usdAxis,
  valueAxis,
} from './style';

/** Per platform: first-offer value + follow-on value per activated user, against what one costs. */
export function userWorthOption(o: Outputs, pal: Palette): EChartsOption {
  const rows = PLATFORMS.map((p) => {
    const l = o.platforms[p].ladder;
    const first = fin(toUsd(l.goals.reduce((a, g) => a + g.value, 0)));
    const follow = fin(toUsd(l.followOn));
    return {
      p,
      first,
      follow,
      worth: first + follow,
      cost: fin(toUsd(l.needed)),
      costOk: Number.isFinite(l.needed),
    };
  });
  // Rows whose cost per activated user is finite: the cost tick is drawn only for them.
  const costed = rows.filter((x) => x.costOk);
  const gap = (x: (typeof rows)[number]) =>
    x.cost > x.worth
      ? `${money((x.cost - x.worth) * 1e6)} short`
      : `${money((x.worth - x.cost) * 1e6)} to spare`;
  const lo = Math.min(0, ...rows.map((x) => Math.min(x.first, x.worth)));
  // "worth $X" sits under the larger of the two stacked parts, so it stays inside the plot.
  const worthLabel = (on: (x: (typeof rows)[number]) => boolean) => ({
    show: true,
    position: 'bottom' as const,
    distance: 4,
    color: pal.ink2,
    fontSize: LABEL,
    formatter: (d: { dataIndex: number }) => {
      const x = nth(rows, d.dataIndex);
      return on(x)
        ? `worth ${money(x.worth * 1e6)}${x.costOk && x.cost <= x.worth ? ` · ${gap(x)}` : ''}`
        : '';
    },
  });
  return {
    ...base(pal),
    grid: { left: 84, right: 32, top: 32, bottom: 44 },
    tooltip: {
      ...base(pal).tooltip,
      trigger: 'item',
      valueFormatter: (v) => money(Number(v) * 1e6),
    },
    xAxis: {
      type: 'value',
      min: lo < 0 ? undefined : 0,
      name: '$ per activated user',
      nameLocation: 'middle',
      nameGap: 28,
      ...valueAxis(pal),
      axisLabel: { ...valueAxis(pal).axisLabel, formatter: usdAxis },
    },
    yAxis: { ...categoryAxis(pal, platformCats), inverse: true },
    series: [
      {
        type: 'bar',
        name: 'First offer',
        stack: 'worth',
        barWidth: 22,
        emphasis: hover(pal),
        data: rows.map((x) => ({
          value: x.first,
          itemStyle: {
            color: barFill(pal.neutral),
            borderRadius: x.follow === 0 ? ROUND : 0,
          },
        })),
        label: worthLabel((x) => x.follow === 0),
      },
      {
        type: 'bar',
        name: 'Follow-on',
        stack: 'worth',
        barWidth: 22,
        emphasis: hover(pal),
        data: rows.map((x) => ({
          value: x.follow,
          itemStyle: { color: barFill(pal.series[x.p]), borderRadius: ROUND },
        })),
        label: worthLabel((x) => x.follow !== 0),
      },
      {
        type: 'scatter',
        name: 'Cost per activated user',
        symbol: 'rect',
        symbolSize: [3, 34],
        itemStyle: { color: pal.ink },
        data: costed.map((x) => [x.cost, rows.indexOf(x)]),
        label: {
          show: true,
          position: 'top',
          distance: 2,
          color: pal.ink,
          fontSize: LABEL,
          formatter: (d: { dataIndex: number }) =>
            `costs ${money(nth(costed, d.dataIndex).cost * 1e6)}`,
        },
        markLine: {
          symbol: 'none',
          silent: true,
          data: costed.flatMap((x) =>
            x.cost > x.worth ? [connector(pal, rows.indexOf(x), x.worth, x.cost, gap(x))] : [],
          ),
        },
      },
    ],
  };
}

export const userWorthAnswer = (o: Outputs) => {
  const parts = PLATFORMS.map((p) => {
    const l = o.platforms[p].ladder;
    return `${PLATFORM_NAME[p]}: costs ${money(l.needed)}, first offer brings ${money(l.goals.reduce((a, g) => a + g.value, 0))}, follow-on ${money(l.followOn)}`;
  });
  return `${parts.join('; ')}.`;
};
