/**
 * Reads the chart colours from the CSS tokens, so ECharts and the page share one source of
 * colour and no chart code holds a hex value.
 */
import type { Palette } from './charts/style';

export function readPalette(): Palette {
  const css = (name: string) =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return {
    page: css('--bg'),
    surface: css('--surface-2'),
    grid: css('--grid'),
    ink: css('--ink'),
    ink2: css('--ink-2'),
    muted: css('--muted'),
    rule: css('--border'),
    axis: css('--border-strong'),
    neutral: css('--neutral'),
    series: { android: css('--android'), ios: css('--ios') },
    accents: ['--teal', '--violet', '--amber', '--coral', '--sky'].map(css),
    good: css('--good'),
    bad: css('--bad'),
    goodFill: css('--good-fill'),
    badFill: css('--bad-fill'),
    font: css('--font'),
  };
}
