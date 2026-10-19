/**
 * The chart grid: one figure per chart spec (question as its title, a one-line answer, the plot),
 * and an Android/iOS toggle on the charts drawn for one platform at a time.
 */
import type { Outputs } from '../src/model/scenario-types';
import { PLATFORMS, type Platform } from '../src/shared/types';
import { mountChart } from './charts/echart';
import { CHARTS, type ChartSpec } from './charts/options';
import type { Palette } from './charts/style';
import { button, h } from './dom';
import { PLATFORM_NAME } from './names';

type MountedChart = {
  spec: ChartSpec;
  answer: HTMLElement;
  set: ReturnType<typeof mountChart>['set'];
};

/** The Android/iOS toggle for a one-platform chart. */
function platformToggle(onFocus: (p: Platform) => void): HTMLElement {
  const buttons = PLATFORMS.map((p) =>
    button({ 'data-focus': p }, PLATFORM_NAME[p], () => onFocus(p)),
  );
  return h('div', { class: 'seg', role: 'group', 'aria-label': 'Platform' }, ...buttons);
}

export function mountCharts(container: HTMLElement, onFocus: (p: Platform) => void) {
  const charts: MountedChart[] = CHARTS.map((spec) => {
    const plot = h('div', { class: 'plot', role: 'img', 'aria-label': spec.question });
    const answer = h('p', { class: 'answer' });
    const head = h('div', { class: 'chart-head' }, h('h3', {}, spec.question));
    if (spec.focus) head.append(platformToggle(onFocus));
    const cls = spec.wide ? 'chart wide' : 'chart';
    container.append(h('figure', { class: cls, 'data-id': spec.id }, head, answer, plot));
    return { spec, answer, set: mountChart(plot).set };
  });

  return {
    render(o: Outputs, palette: Palette, focus: Platform) {
      for (const b of container.querySelectorAll<HTMLElement>('[data-focus]'))
        b.setAttribute('aria-pressed', String(b.dataset.focus === focus));
      for (const c of charts) {
        c.answer.textContent = c.spec.answer(o, focus);
        c.set(c.spec.build(o, palette, focus));
      }
    },
  };
}
