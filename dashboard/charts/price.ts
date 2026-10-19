/**
 * At what CPM does it pay? Worth per 1,000 impressions (bar) against the price paid (tick), per platform.
 * Pure: (outputs, palette[, platform]) → ECharts option, plus the one-line answer under its title.
 */
import type { EChartsOption } from 'echarts';
import type { Outputs } from '../../src/model/scenario-types';
import { PLATFORMS } from '../../src/shared/types';
import { money, pctAuto, signedMoney } from '../format';
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
  one,
  type Palette,
  platformCats,
  priceText,
  ROUND,
  usdAxis,
  valueAxis,
} from './style';

/** Worth per 1,000 impressions (bar) against the price paid (tick), per platform. */
export function priceOption(o: Outputs, pal: Palette): EChartsOption {
  const rows = PLATFORMS.map((p) => ({
    p,
    r: o.platforms[p],
    worth: fin(toUsd(o.platforms[p].value1000)),
    paid: fin(toUsd(o.platforms[p].bid)),
  }));
  const lo = Math.min(0, ...rows.map((x) => x.worth));
  return {
    ...base(pal),
    grid: { left: 84, right: 32, top: 32, bottom: 44 },
    tooltip: { ...base(pal).tooltip, trigger: 'item' },
    xAxis: {
      type: 'value',
      min: lo < 0 ? undefined : 0,
      name: '$ per 1,000 impressions',
      nameLocation: 'middle',
      nameGap: 28,
      ...valueAxis(pal),
      axisLabel: { ...valueAxis(pal).axisLabel, formatter: usdAxis },
    },
    yAxis: { ...categoryAxis(pal, platformCats), inverse: true },
    series: [
      {
        type: 'bar',
        name: 'Worth per 1,000 impressions',
        barWidth: 22,
        emphasis: hover(pal),
        data: rows.map(({ p, worth }) => ({
          value: worth,
          itemStyle: { color: barFill(pal.series[p]), borderRadius: ROUND },
        })),
        // The profit rides on the connector when the price is past the bar, else on this label.
        label: {
          show: true,
          position: 'bottom',
          distance: 4,
          color: pal.ink2,
          fontSize: LABEL,
          formatter: (d: { dataIndex: number }) => {
            const x = nth(rows, d.dataIndex);
            return `worth ${money(x.r.value1000)}${x.paid > x.worth ? '' : ` · ${signedMoney(x.r.profit1000)} per 1,000`}`;
          },
        },
        tooltip: {
          formatter: (d) => {
            const x = nth(rows, one(d).dataIndex);
            return `<b>${PLATFORM_NAME[x.p]}</b><br/>Worth ${money(x.r.value1000)} per 1,000<br/>Paid ${priceText(x.r)}<br/>Profit ${signedMoney(x.r.profit1000)} per 1,000`;
          },
        },
      },
      {
        type: 'scatter',
        name: 'Price paid',
        symbol: 'rect',
        symbolSize: [3, 34],
        itemStyle: { color: pal.ink },
        data: rows.map(({ paid }, i) => [paid, i]),
        label: {
          show: true,
          position: 'top',
          distance: 2,
          color: pal.ink,
          fontSize: LABEL,
          formatter: (d: { dataIndex: number }) => `paid ${priceText(nth(rows, d.dataIndex).r)}`,
        },
        tooltip: {
          formatter: (d) => {
            const r = nth(rows, one(d).dataIndex).r;
            return `Paid ${priceText(r)}<br/>Wins ${pctAuto(r.winRateAtBid)} of auctions`;
          },
        },
        markLine: {
          symbol: 'none',
          silent: true,
          data: rows
            .filter((x) => x.paid > x.worth)
            .map((x) =>
              connector(
                pal,
                rows.indexOf(x),
                x.worth,
                x.paid,
                `${signedMoney(x.r.profit1000)} per 1,000`,
              ),
            ),
        },
      },
    ],
  };
}

export const priceAnswer = (o: Outputs) =>
  `${PLATFORMS.map(
    (p) =>
      `${PLATFORM_NAME[p]} is worth ${money(o.platforms[p].value1000)} per 1,000 impressions and pays ${priceText(o.platforms[p])}`,
  ).join('; ')}.`;
