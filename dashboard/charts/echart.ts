/**
 * The one ECharts wrapper: tree-shaken registration, init into a div, full option replace on
 * every update (setOption(opt, true), so removed series really go) and a ResizeObserver. Charts
 * live as long as the page, so there is no dispose.
 */

import type { EChartsOption } from 'echarts';
import { BarChart, FunnelChart, HeatmapChart, ScatterChart } from 'echarts/charts';
import {
  AxisPointerComponent,
  GridComponent,
  MarkAreaComponent,
  MarkLineComponent,
  TooltipComponent,
  VisualMapPiecewiseComponent,
} from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([
  BarChart,
  FunnelChart,
  HeatmapChart,
  ScatterChart,
  GridComponent,
  TooltipComponent,
  MarkAreaComponent,
  MarkLineComponent,
  AxisPointerComponent,
  VisualMapPiecewiseComponent,
  CanvasRenderer,
]);

export function mountChart(el: HTMLElement) {
  const chart = echarts.init(el, undefined, { renderer: 'canvas' });
  new ResizeObserver(() => chart.resize()).observe(el);
  return { set: (option: EChartsOption) => chart.setOption(option, true) };
}
