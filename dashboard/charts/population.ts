/**
 * Who is left at each gate? The model's population steps, from every linked user to those the
 * test reaches, as a funnel coloured by step. Widths are the users left, so a narrow band is a
 * gate that removes many. Pure: (outputs, palette) → ECharts option, plus its one-line answer.
 */
import type { EChartsOption } from 'echarts';
import type { Outputs } from '../../src/model/scenario-types';
import { compactNum } from '../format';
import { poolLabel } from './pool';
import { accent, barFill, base, fin, hover, LABEL, nth, one, type Palette } from './style';

/** One band per population step, widest first, labelled with the users left. */
export function populationOption(o: Outputs, pal: Palette): EChartsOption {
  const steps = o.pool;
  const top = Math.max(1, fin(nth(steps, 0).total));
  return {
    ...base(pal),
    tooltip: {
      ...base(pal).tooltip,
      trigger: 'item',
      formatter: (d) => {
        const s = nth(steps, one(d).dataIndex);
        return `<b>${poolLabel(s)}</b><br/>${compactNum(s.total)} users<br/>Android ${compactNum(s.users.android)} · iOS ${compactNum(s.users.ios)}`;
      },
    },
    series: [
      {
        type: 'funnel',
        sort: 'none',
        left: 8,
        right: '42%',
        top: 8,
        bottom: 8,
        min: 0,
        max: top,
        minSize: '6%',
        gap: 3,
        emphasis: hover(pal),
        itemStyle: { borderWidth: 0, borderRadius: 6 },
        label: {
          show: true,
          position: 'right',
          color: pal.ink,
          fontSize: LABEL,
          formatter: (d: { dataIndex: number }) => {
            const s = nth(steps, d.dataIndex);
            return `${poolLabel(s)}  {n|${compactNum(s.total)}}`;
          },
          rich: { n: { color: pal.ink2, fontSize: LABEL, fontWeight: 'bold' } },
        },
        labelLine: { show: true, length: 12, lineStyle: { color: pal.axis } },
        data: steps.map((s, i) => ({
          name: poolLabel(s),
          value: fin(s.total),
          itemStyle: { color: barFill(accent(pal, i)) },
        })),
      },
    ],
  };
}

export function populationAnswer(o: Outputs) {
  const first = nth(o.pool, 0);
  const last = nth(o.pool, o.pool.length - 1);
  return `${compactNum(first.total)} ${poolLabel(first).toLowerCase()} narrow to ${compactNum(last.total)} ${poolLabel(last).toLowerCase()} across ${o.pool.length - 1} gates.`;
}
