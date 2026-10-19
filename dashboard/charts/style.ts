/**
 * The look every chart shares: the palette read from the CSS tokens, text sizes, axes, tooltips,
 * gradient fills, hover emphasis, the dashed connector that labels a gap, and two helpers for
 * reading ECharts callbacks. Rules: no legends (marks are labelled where they are), light
 * gridlines on value axes only, and platform colour follows the entity (Android sky, iOS violet).
 */
import type { EChartsOption } from 'echarts';
import type { PlatformResult } from '../../src/model/scenario-types';
import { PLATFORMS, type Platform } from '../../src/shared/types';
import { cpm, money } from '../format';
import { PLATFORM_NAME } from '../names';

export type Palette = {
  page: string;
  surface: string; // tooltip background
  grid: string; // gridlines
  ink: string;
  ink2: string;
  muted: string;
  rule: string;
  axis: string;
  neutral: string;
  series: Record<Platform, string>;
  /** The accent set in order (teal, violet, amber, coral, sky): one colour per step of a sequence. */
  accents: string[];
  good: string;
  bad: string;
  goodFill: string;
  badFill: string;
  font: string;
};

/** Item i of a list the chart built: ECharts only hands back indices into data we gave it. */
export function nth<T>(xs: readonly T[], i: number): T {
  const x = xs[i];
  if (x === undefined) throw new RangeError(`chart index ${i} is outside its ${xs.length} items`);
  return x;
}

/** A tooltip's one data point (ECharts passes an array when the trigger is an axis). */
export const one = <T>(p: T | T[]): T => (Array.isArray(p) ? nth(p, 0) : p);

export const LABEL = 14; // smallest chart text (the page's small size); category names use the body size
const BODY = 16;
export const usdAxis = (v: number) =>
  money(v * 1_000_000, Math.abs(v) < 10 && v !== 0 ? 2 : 0, true);
export const fin = (x: number, fallback = 0) => (Number.isFinite(x) ? x : fallback);
/** "$17 CPM", or "$4.10 eCPM" when buying per offer start. */
export const priceText = (r: PlatformResult) =>
  `${cpm(r.bid)} ${r.verdict.buyMode === 'cpm' ? 'CPM' : 'eCPM'}`;

/** Accent i of the set, wrapping round: a sequence longer than the set reuses its colours. */
export const accent = (pal: Palette, i: number) => nth(pal.accents, i % pal.accents.length);

/** A colour at a given opacity: tokens are 6-digit hex, so append the alpha byte. */
export const tint = (color: string, alpha: number) =>
  `${color}${Math.round(alpha * 255)
    .toString(16)
    .padStart(2, '0')}`;

/** A horizontal bar fill from a faint tint at the base to the full colour at the value end. */
export const barFill = (color: string, towards: 'right' | 'left' = 'right') => ({
  type: 'linear' as const,
  x: towards === 'right' ? 0 : 1,
  y: 0,
  x2: towards === 'right' ? 1 : 0,
  y2: 0,
  colorStops: [
    { offset: 0, color: tint(color, 0.35) },
    { offset: 1, color },
  ],
});

/** Horizontal bars round their value end (our own design choice, applied on every chart). */
export const ROUND: [number, number, number, number] = [0, 6, 6, 0];
export const ROUND_LEFT: [number, number, number, number] = [6, 0, 0, 6];

/** Hovering a mark lifts it with a soft glow and dims the rest of its chart. */
export const hover = (pal: Palette) => ({
  focus: 'self' as const,
  itemStyle: { shadowBlur: 14, shadowColor: tint(pal.page, 0.9), borderColor: pal.ink },
});

export function base(pal: Palette): EChartsOption {
  return {
    animation: true,
    animationDuration: 600,
    animationDurationUpdate: 450,
    animationEasing: 'cubicOut',
    animationEasingUpdate: 'cubicOut',
    backgroundColor: 'transparent',
    textStyle: { fontFamily: pal.font, fontSize: LABEL, color: pal.ink2 },
    tooltip: {
      backgroundColor: tint(pal.surface, 0.96),
      borderColor: pal.axis,
      borderWidth: 1,
      padding: [10, 14],
      textStyle: { color: pal.ink, fontSize: LABEL, fontFamily: pal.font },
      extraCssText: 'border-radius: 10px; box-shadow: 0 12px 32px -8px rgba(0, 0, 0, 0.7);',
      confine: true,
    },
  };
}

export const valueAxis = (pal: Palette) => ({
  axisLine: { show: false },
  axisTick: { show: false },
  axisLabel: { color: pal.muted, fontSize: LABEL },
  splitLine: { show: true, lineStyle: { color: pal.grid, width: 1 } },
  splitNumber: 4,
  nameTextStyle: { color: pal.muted, fontSize: LABEL },
});

export const categoryAxis = (pal: Palette, data: string[]) => ({
  type: 'category' as const,
  data,
  axisLine: { show: false },
  axisTick: { show: false },
  splitLine: { show: false },
  axisLabel: { color: pal.ink, fontSize: BODY, interval: 0 },
});

export const platformCats = PLATFORMS.map((p) => PLATFORM_NAME[p]);

/** A neutral connector between two x positions on row i, labelled above its middle. */
type Point = { coord: number[]; lineStyle?: object; label?: object };
export const connector = (
  pal: Palette,
  i: number,
  from: number,
  to: number,
  text: string,
): [Point, Point] => [
  {
    coord: [from, i],
    lineStyle: { color: pal.ink2, type: 'dashed', width: 1.5 },
    label: {
      show: true,
      formatter: text,
      position: 'insideMiddleBottom',
      color: pal.ink2,
      fontSize: LABEL,
    },
  },
  { coord: [to, i] },
];
