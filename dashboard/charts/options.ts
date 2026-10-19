/**
 * The chart registry: each chart's question (its title), its one-line answer and its option
 * builder, in page order. Every builder is pure: (outputs, palette, platform) → ECharts option,
 * reading only evaluate()'s outputs, so tests assert on the options directly. Profit/loss colour
 * appears only where a value crosses zero (tornado, break-even map).
 */
import type { EChartsOption } from 'echarts';
import type { Outputs } from '../../src/model/scenario-types';
import type { Platform } from '../../src/shared/types';
import { breakEvenAnswer, breakEvenMapOption } from './break-even';
import { impressionsAnswer, impressionsOption } from './impressions';
import { poolAnswer, poolOption } from './pool';
import { populationAnswer, populationOption } from './population';
import { priceAnswer, priceOption } from './price';
import type { Palette } from './style';
import { tornadoAnswer, tornadoOption } from './tornado';
import { userWorthAnswer, userWorthOption } from './user-worth';

export type ChartSpec = {
  id: string;
  question: string;
  answer: (o: Outputs, focus: Platform) => string;
  build: (o: Outputs, pal: Palette, focus: Platform) => EChartsOption;
  focus?: true; // drawn for one platform at a time
  wide?: true;
};

export const CHARTS: ChartSpec[] = [
  { id: 'price', question: 'At what CPM does it pay?', answer: priceAnswer, build: priceOption },
  {
    id: 'worth',
    question: 'What is an activated user worth?',
    answer: userWorthAnswer,
    build: userWorthOption,
  },
  {
    id: 'tornado',
    question: 'Which input moves profit most?',
    answer: tornadoAnswer,
    build: tornadoOption,
    focus: true,
    wide: true,
  },
  {
    id: 'breakeven',
    question: 'What click-through or follow-on value breaks even?',
    answer: breakEvenAnswer,
    build: breakEvenMapOption,
    focus: true,
  },
  {
    id: 'impressions',
    question: 'Where do 1,000 impressions go?',
    answer: impressionsAnswer,
    build: impressionsOption,
  },
  {
    id: 'population',
    question: 'Who is left at each gate?',
    answer: populationAnswer,
    build: populationOption,
  },
  { id: 'pool', question: 'How many users can we reach?', answer: poolAnswer, build: poolOption },
];
