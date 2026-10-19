/**
 * The key numbers at the top of the page, as data: per-platform unit economics and the test the
 * budget buys, each a plain figure with its unit. No judgement; signed figures carry their sign so
 * the view can colour them. Pure, so tests can check every string.
 */
import type { Outputs, PlatformResult } from '../src/model/scenario-types';
import type { Platform } from '../src/shared/types';
import { compactNum, cpm, money, pct, pctAuto, signedMoney } from './format';

/** `sign` is set on figures that can be either side of zero, so the page can colour them. */
export type Figure = { value: string; detail?: string; sign?: number };
export type Column = {
  label: string;
  unit: string;
  figure: (r: PlatformResult, o: Outputs) => Figure;
};

const isCpm = (r: PlatformResult) => r.verdict.buyMode === 'cpm';
const priceDetail = (r: PlatformResult) =>
  r.verdict.buyMode === 'revShare'
    ? 'revenue share · no auction'
    : `${isCpm(r) ? '' : 'eCPM · '}wins ${pctAuto(r.winRateAtBid)} of auctions`;

export const COLUMNS: Column[] = [
  { label: 'Worth', unit: 'per 1,000 impressions', figure: (r) => ({ value: money(r.value1000) }) },
  {
    label: 'Price paid',
    unit: 'per 1,000 impressions',
    figure: (r) => ({ value: cpm(r.bid), detail: priceDetail(r) }),
  },
  {
    label: 'Profit',
    unit: 'per 1,000 impressions',
    figure: (r) => ({ value: signedMoney(r.profit1000), sign: Math.sign(r.profit1000) }),
  },
  { label: 'Max bid', unit: 'CPM, after our margin', figure: (r) => ({ value: cpm(r.maxCpm) }) },
  {
    label: 'Break-even follow\u2011on',
    unit: 'per activated user',
    // "$0" rather than words: the figure is set large and a phrase would run into the next column.
    figure: (r) => ({
      value: money(Math.max(0, r.breakEvenFollowOn)),
      detail: `${r.breakEvenFollowOn <= 0 ? 'none needed · ' : ''}counting ${money(r.ladder.followOn)} today`,
    }),
  },
  {
    label: 'Break-even click\u2011through',
    unit: 'at the price paid',
    figure: (r) =>
      isCpm(r)
        ? { value: pct(r.breakEvenCtr), detail: `today ${pct(r.heatmap.current.ctr)}` }
        : { value: '—', detail: 'price moves with CTR in this buying mode' },
  },
];

export type Row = { platform: Platform; figures: Figure[] };

/** One row per platform. */
export function keyNumbers(o: Outputs): Row[] {
  return (['android', 'ios'] as const).map((p) => ({
    platform: p,
    figures: COLUMNS.map((c) => c.figure(o.platforms[p], o)),
  }));
}

export type TestFigure = {
  label: string;
  value: string;
  detail?: string;
  sign?: number;
};

/** The test the budget buys: size, spend, what it can detect and what it would need. */
export function testNumbers(o: Outputs): TestFigure[] {
  const s = o.sizing;
  return [
    {
      label: 'Users enrolled',
      value: compactNum(s.enrolled),
      detail: s.budgetBinds ? 'limited by budget' : 'every eligible user',
    },
    { label: 'Spend', value: money(s.spent, 0, true) },
    { label: 'Smallest detectable effect', value: money(s.mde, 3), detail: 'per treated user' },
    {
      label: 'Expected effect',
      value: signedMoney(s.effect, 3),
      sign: Math.sign(s.effect),
      detail: 'profit per treated user',
    },
    {
      label: 'Users to detect it',
      value: Number.isFinite(s.enrolledNeeded) ? compactNum(s.enrolledNeeded) : '—',
      detail: Number.isFinite(s.enrolledNeeded)
        ? `≈ ${money(s.budgetNeeded, 0, true)} spend`
        : 'no effect to detect',
    },
  ];
}
