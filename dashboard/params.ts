/**
 * Every input the model uses, declared once as data. This table drives the input rail (folder,
 * group, label, unit, order), the URL hash (short keys, diffs only), per-folder reset, the
 * Conservative/Upside scenarios (from each row's pess/opt) and the tornado. A row whose range
 * depends on the other params says so with `rangeIn` (CPM ranges follow the region).
 * A guard test checks that every number in the Scenario comes from a row here, so there are no
 * hidden constants. Defaults come from src/model wherever the model has one, in UI units.
 *
 * To add a control: add a row (and, if it's a new kind of thing, a folder). Rows render in table
 * order inside their folder; `group` makes a sub-folder. Never change a `key` or `short`: links
 * people have shared carry the shorts.
 */
import {
  DEFAULT_ELIGIBILITY,
  DEFAULT_FREQUENCY_CAP,
  DEFAULT_FUNNEL,
  DEFAULT_HOLDOUT_PCT,
  DEFAULT_TARGET_MARGIN,
} from '../src/model/funnel';
import { GOALS, type GoalSpec, OFFER_LADDERS } from '../src/model/goals';
import {
  CPM_PAID,
  DEFAULT_PLATFORM_FEE,
  LIST_REACH_14D,
  MEDIAN_CLEARING_CPM,
  REGION_PAYOUT_MULTIPLIER,
  REGIONS,
  type Region,
} from '../src/model/market';
import {
  DEFAULT_FOLLOW_ON,
  DEFAULT_SEGMENT_DAYS,
  DEFAULT_SEGMENT_LIFT,
  DEFAULT_TIER_LIFT,
  SEGMENTS,
  type Segment,
} from '../src/model/segments';
import type { Platform } from '../src/shared/types';
import { PLATFORM_NAME } from './names';
import { toPct, toUsd } from './units';

export type Value = number | boolean | string;
/**
 * Param values by key. An open table on purpose: the rows (and so the keys) are data, and every
 * value that enters from a link or storage is checked against its row first (isValid).
 */
export interface Params {
  [key: string]: Value;
}
type Unit = '%' | '$' | '×' | 'users' | 'days' | '/day' | '';
/** A row's conservative (pess) and upside (opt) values. */
export type RangeEnds = { pess: Value; opt: Value };

/** Rail folders, top to bottom. */
export const FOLDERS = [
  {
    id: 'ask',
    title: 'Key inputs',
    open: true,
    groupsOpen: false,
    note: 'The numbers the partner is most likely to give. Everything updates as you type.',
  },
  { id: 'funnel', title: 'Ad performance', open: false, groupsOpen: true, note: '' },
  { id: 'population', title: 'Audience', open: false, groupsOpen: false, note: '' },
  {
    id: 'offer',
    title: 'Offer details',
    open: false,
    groupsOpen: false,
    note: "Choosing an offer under Key inputs loads its goals here. The sources put the median offer's margin nearer $2.60 than $3.17: try about 82% goal completion.",
  },
  {
    id: 'market',
    title: 'Auction',
    open: false,
    groupsOpen: false,
    note: "Switching region swaps the market prices and resets both CPMs to that region's typical price.",
  },
  { id: 'thresholds', title: 'Judgement calls', open: false, groupsOpen: false, note: '' },
  { id: 'experiment', title: 'Test design', open: false, groupsOpen: false, note: '' },
] as const satisfies readonly {
  id: string;
  title: string;
  open: boolean; // expanded on load
  groupsOpen: boolean; // its sub-folders expanded on load too
  note: string; // the folder's tooltip ('' for none)
}[];
export type FolderId = (typeof FOLDERS)[number]['id'];

type ParamBase = {
  key: string;
  short: string; // URL hash key: never change it
  folder: FolderId;
  group?: string; // sub-folder inside the folder
  label: string; // lower-case unless a name: shown capitalised in the rail, after the group elsewhere
  unit: Unit;
  unitText?: string; // rail unit when the bare unit isn't enough, e.g. "$ per user"
  pess?: Value;
  opt?: Value;
  /** A range that depends on the other params; it replaces pess/opt. */
  rangeIn?: (params: Params) => RangeEnds;
  source: string; // plain words: shown as the row's tooltip
};
export type NumberParam = ParamBase & {
  kind: 'slider' | 'number';
  default: number;
  min: number;
  max: number;
  step: number;
};
type BoolParam = ParamBase & { kind: 'bool'; default: boolean };
type ListParam = ParamBase & {
  kind: 'list';
  default: string;
  options: { value: string; text: string }[];
};
export type Param = NumberParam | BoolParam | ListParam;

const ASK = 'Our estimate: ask Almedia';

/** Ladders by name, as GoalSpec lists from src/model/goals.ts. */
export const LADDERS: ReadonlyMap<string, GoalSpec[]> = new Map([
  ['illustrative', GOALS],
  ['median', OFFER_LADDERS.median],
  ['highValue', OFFER_LADDERS.highValue],
  ['premium', OFFER_LADDERS.premium],
]);
export const MAX_GOALS = Math.max(...[...LADDERS.values()].map((l) => l.length));

/** The letter a segment's keys use: shareH, liftWCtr, targetC. */
const SEGMENT_LETTER: Record<Segment, 'H' | 'W' | 'C'> = { hot: 'H', warm: 'W', cold: 'C' };
const SEGMENT_TITLE: Record<Segment, string> = { hot: 'Hot', warm: 'Warm', cold: 'Cold' };
const PLATFORM_LETTER: Record<Platform, 'A' | 'I'> = { android: 'A', ios: 'I' };

/** The four values of goal slot i in a ladder (empty and off past its end), in UI units. */
type GoalSlotValues = { on: boolean; payout: number; reward: number; completion: number };
function goalSlot(ladder: string, i: number): GoalSlotValues {
  const g = LADDERS.get(ladder)?.[i];
  return g
    ? {
        on: true,
        payout: toUsd(g.payout),
        reward: toUsd(g.reward),
        completion: toPct(g.completionRate),
      }
    : { on: false, payout: 0, reward: 0, completion: 0 };
}

/** Goal slot i's params, filled from a ladder. */
function goalValues(ladder: string, i: number): Params {
  const g = goalSlot(ladder, i);
  return Object.fromEntries([
    [`goal${i}Payout`, g.payout],
    [`goal${i}Reward`, g.reward],
    [`goal${i}Completion`, g.completion],
    [`goal${i}On`, g.on],
  ]);
}

/** A list param's value, checked against the values the caller accepts (a broken invariant throws). */
export function listValue<T extends string>(params: Params, key: string, allowed: readonly T[]): T {
  const value = params[key];
  const found = allowed.find((a) => a === value);
  if (found === undefined)
    throw new Error(`${key} is ${String(value)}, not one of ${allowed.join(', ')}`);
  return found;
}

const regionIn = (params: Params): Region => listValue(params, 'region', REGIONS);

/** The region's typical (base) CPM paid, per platform, in dollars. */
const cpmFor = (region: Region) => ({
  cpmA: toUsd(CPM_PAID[region].android[1]),
  cpmI: toUsd(CPM_PAID[region].ios[1]),
});

/** A CPM range that follows the region: the high CPM_PAID figure is conservative, the low one upside. */
const cpmRange =
  (platform: Platform) =>
  (params: Params): RangeEnds => {
    const [low, , high] = CPM_PAID[regionIn(params)][platform];
    return { pess: toUsd(high), opt: toUsd(low) };
  };

const goalParams = (): Param[] =>
  Array.from({ length: MAX_GOALS }, (_, i) => {
    const d = goalSlot('illustrative', i);
    const group = `Goal ${i + 1}`;
    const src = 'Loaded from the chosen offer. Completion rates are estimates: ask Almedia';
    return [
      {
        key: `goal${i}On`,
        short: `g${i}on`,
        folder: 'offer',
        group,
        label: 'included',
        unit: '',
        kind: 'bool',
        default: d.on,
        source: src,
      },
      {
        key: `goal${i}Payout`,
        short: `g${i}p`,
        folder: 'offer',
        group,
        label: 'advertiser payout',
        unit: '$',
        kind: 'number',
        default: d.payout,
        min: 0,
        max: 5000,
        step: 0.01,
        source: src,
      },
      {
        key: `goal${i}Reward`,
        short: `g${i}r`,
        folder: 'offer',
        group,
        label: 'user reward',
        unit: '$',
        kind: 'number',
        default: d.reward,
        min: 0,
        max: 5000,
        step: 0.01,
        source: src,
      },
      {
        key: `goal${i}Completion`,
        short: `g${i}c`,
        folder: 'offer',
        group,
        label: 'completion rate',
        unit: '%',
        kind: 'slider',
        default: d.completion,
        min: 0,
        max: 100,
        step: 0.1,
        source: src,
      },
    ] satisfies Param[];
  }).flat();

const funnelParams = (platform: Platform): Param[] => {
  const f = DEFAULT_FUNNEL[platform];
  const s = PLATFORM_LETTER[platform];
  const group = PLATFORM_NAME[platform];
  const pctRow = (
    key: string,
    label: string,
    def: number,
    min: number,
    max: number,
    step: number,
    pess: number,
    opt: number,
    source: string,
  ): Param => ({
    key: `${key}${s}`,
    short: `${key}${s}`,
    folder: 'funnel',
    group,
    label,
    unit: '%',
    kind: 'slider',
    default: toPct(def),
    min,
    max,
    step,
    pess,
    opt,
    source,
  });
  return [
    pctRow(
      'ctr',
      'click-through rate',
      f.ctr,
      0.1,
      15,
      0.1,
      1.5,
      4,
      'No public in-app retargeting CTR. Raw full-screen gaming CTRs read 2–15% but include accidental taps; 2.5% (1.5–4%) is our estimate of real taps',
    ),
    pctRow(
      'start',
      'clicks that start the offer',
      f.startRate,
      1,
      100,
      1,
      20,
      40,
      'No benchmark: the test measures it',
    ),
    pctRow(
      'install',
      'starts that install',
      f.installRate,
      1,
      100,
      1,
      45,
      70,
      'No benchmark: the test measures it',
    ),
    pctRow(
      'cred',
      'installs credited to Freecash',
      f.attributedRate,
      1,
      100,
      1,
      platform === 'android' ? 80 : 33,
      platform === 'android' ? 95 : 55,
      'Last-click share. On iOS the offer game must also get tracking consent',
    ),
    pctRow(
      'incr',
      'installs caused by the ad',
      f.incrementality,
      1,
      100,
      1,
      25,
      55,
      "Share of installs that wouldn't have happened without the ad",
    ),
  ];
};

/**
 * Incrementality ranges from published experiments: hot 0.75 (our reading of eBay and direct mail)
 * to 0.91 (Hillstrom); cold 0.9 (our cautious end) to 1.3 (Hillstrom).
 */
const INCR_RANGE: Partial<Record<Segment, [number, number]>> = {
  hot: [0.75, 0.91],
  cold: [0.9, 1.3],
};

/**
 * Hot users' upside lifts: ×1.5 click-through × ×1.3 starts = ×1.95, the earlier working values. They
 * are optimistic (above Hillstrom's ×1.27 visits, ×1.55 conversions), so only Upside uses them.
 */
export const HOT_UPSIDE = { ctr: 1.5, startRate: 1.3 };

/** Follow-on value per activated user, by segment, for one horizon. Warm keeps the original keys. */
const followOnRows = (horizon: 'd90' | 'm12'): Param[] => {
  const days = horizon === 'd90' ? '90' : '12';
  const span = horizon === 'd90' ? '90 days' : '12 months';
  // Low end ~$0 (if activated users would have earned as much anyway); high end our optimistic
  // case per segment.
  const high: Record<Segment, number> =
    horizon === 'd90' ? { hot: 10.7, warm: 6.4, cold: 5.1 } : { hot: 23.9, warm: 14.2, cold: 11.4 };
  return SEGMENTS.map((seg) => ({
    key: seg === 'warm' ? `followOn${days}` : `followOn${days}${SEGMENT_LETTER[seg]}`,
    short: seg === 'warm' ? `f${days}` : `f${days}${SEGMENT_LETTER[seg]}`,
    folder: 'ask',
    group: `Follow-on value, ${span}`,
    label: `${seg} users`,
    unit: '$',
    unitText: '$ per user',
    kind: 'number',
    default: toUsd(DEFAULT_FOLLOW_ON[seg][horizon]),
    min: 0,
    max: 1000,
    step: 0.1,
    pess: 0,
    opt: high[seg],
    source:
      'Our estimate of the margin a user won back by the ad earns on later offers. Ask Almedia for cohort data',
  }));
};

/** The high-value tier's share and lifts: used only when the tier is targeted. */
const tierRows = (): Param[] => {
  const l = DEFAULT_TIER_LIFT.high;
  const group = 'High-value tier';
  const row = (
    key: string,
    short: string,
    label: string,
    def: number,
    pess: number,
    opt: number,
    source: string,
  ): Param => ({
    key,
    short,
    folder: 'population',
    group,
    label,
    unit: '×',
    kind: 'slider',
    default: def,
    min: 0.1,
    max: 5,
    step: 0.05,
    pess,
    opt,
    source,
  });
  return [
    {
      key: 'tierShare',
      short: 'tsh',
      folder: 'population',
      group,
      label: 'share of users in the tier',
      unit: '%',
      kind: 'slider',
      default: 15,
      min: 1,
      max: 100,
      step: 1,
      pess: 10,
      opt: 20,
      source: 'Top earners by past Link earnings: a placeholder cut. Ask Almedia',
    },
    row(
      'tierCtr',
      'tc',
      'click-through',
      l.ctr,
      1,
      l.ctr,
      "Hillstrom's $750+ customers respond ×1.35 on visits and ×2.0 on conversions; 1.2 × 1.3 = 1.56 sits between, toward the optimistic end",
    ),
    row(
      'tierStart',
      'ts',
      'offer starts',
      l.startRate,
      1.09,
      l.startRate,
      'Conversion vs visit response implies up to ×1.5 past the click; 1.3 (1.09–1.5)',
    ),
    row(
      'tierIncr',
      'ti',
      'caused by the ad',
      l.incrementality,
      0.9,
      1.1,
      'Yahoo: high past buyers show a larger ad effect, not a smaller one',
    ),
    row(
      'tierMargin',
      'tmg',
      'margin per credited install',
      l.margin,
      1,
      2.5,
      "A guess that decides the case: check it in Almedia's history first (stop below 1.2)",
    ),
    row(
      'tierFollowOn',
      'tfo',
      'follow-on value',
      l.followOn,
      2,
      5,
      'A guess: ~1% of users earn ~75% of payouts',
    ),
  ];
};

const segmentRows = (): Param[] => {
  const share = { hot: 28, warm: 43, cold: 29 };
  const rows: Param[] = [
    {
      key: 'daysHot',
      short: 'dH',
      folder: 'population',
      label: 'hot: last active within',
      unit: 'days',
      kind: 'slider',
      default: DEFAULT_SEGMENT_DAYS.hot,
      min: 1,
      max: 30,
      step: 1,
      source: 'Only names the segments: the shares below are the inputs',
    },
    {
      key: 'daysWarm',
      short: 'dW',
      folder: 'population',
      label: 'warm: last active within',
      unit: 'days',
      kind: 'slider',
      default: DEFAULT_SEGMENT_DAYS.warm,
      min: 2,
      max: 90,
      step: 1,
      source: 'Only names the segments: the shares below are the inputs',
    },
  ];
  for (const seg of SEGMENTS) {
    const S = SEGMENT_LETTER[seg];
    rows.push({
      key: `share${S}`,
      short: `s${S}`,
      folder: 'population',
      label: `${seg} users`,
      unit: '%',
      kind: 'slider',
      default: share[seg],
      min: 0,
      max: 100,
      step: 1,
      pess: { hot: 20, warm: 40, cold: 40 }[seg],
      opt: { hot: 35, warm: 43, cold: 22 }[seg],
      source: 'Placeholder split from the demo population (exponential, 12-day mean): ask Almedia',
    });
  }
  for (const seg of SEGMENTS) {
    const S = SEGMENT_LETTER[seg];
    const group = `${SEGMENT_TITLE[seg]} lifts`;
    const src =
      seg === 'hot'
        ? "Our estimate from public experiments until the test measures it. Hot click-through × starts = ×1.56, matching Hillstrom's hot conversion response (×1.55); Upside's ×1.95 is optimistic (above ×1.27 visits, ×1.55 conversions)"
        : 'Our estimate from public experiments until the test measures it per segment';
    const l = DEFAULT_SEGMENT_LIFT[seg];
    const by = (x: number, k: number) => Math.round(x * k * 100) / 100; // ±25% around the default
    const [incrLow, incrHigh] = INCR_RANGE[seg] ?? [
      by(l.incrementality, 0.75),
      by(l.incrementality, 1.25),
    ];
    rows.push(
      {
        key: `lift${S}Ctr`,
        short: `l${S}c`,
        folder: 'population',
        group,
        label: 'click-through',
        unit: '×',
        kind: 'slider',
        default: l.ctr,
        min: 0.1,
        max: 5,
        step: 0.05,
        pess: by(l.ctr, 0.75),
        opt: seg === 'hot' ? HOT_UPSIDE.ctr : by(l.ctr, 1.25),
        source: src,
      },
      {
        key: `lift${S}Start`,
        short: `l${S}s`,
        folder: 'population',
        group,
        label: 'offer starts',
        unit: '×',
        kind: 'slider',
        default: l.startRate,
        min: 0.1,
        max: 5,
        step: 0.05,
        pess: by(l.startRate, 0.75),
        opt: seg === 'hot' ? HOT_UPSIDE.startRate : by(l.startRate, 1.25),
        source: src,
      },
      {
        key: `lift${S}Incr`,
        short: `l${S}i`,
        folder: 'population',
        group,
        label: 'caused by the ad',
        unit: '×',
        kind: 'slider',
        default: l.incrementality,
        min: 0.1,
        max: 5,
        step: 0.05,
        pess: incrLow,
        opt: incrHigh,
        source: src,
      },
    );
  }
  return rows;
};

const medianRow = (region: Region, platform: Platform): Param => ({
  key: `median${region === 'us' ? 'Us' : 'Eu'}${PLATFORM_LETTER[platform]}`,
  short: `m${region}${PLATFORM_LETTER[platform]}`,
  folder: 'market',
  group: 'Win curve',
  label: `${region.toUpperCase()} ${PLATFORM_NAME[platform]} market price`,
  unit: '$',
  unitText: '$ CPM',
  kind: 'number',
  default: toUsd(MEDIAN_CLEARING_CPM[region][platform]),
  min: 0.1,
  max: 200,
  step: 0.5,
  source:
    'Median exchange clearing price, derived from published eCPM reports (Appodeal 2025, Tenjin 2024): half the auctions clear below it',
});

const target = (seg: Segment): Param => {
  const S = SEGMENT_LETTER[seg];
  return {
    key: `target${S}`,
    short: `t${S}`,
    folder: 'ask',
    label: `target ${seg} users`,
    unit: '',
    kind: 'bool',
    default: true,
    source: `Whether ads go to ${seg} users (see Audience for the split)`,
  };
};

export const PARAMS: Param[] = [
  // Key inputs: the most-asked numbers, in the order they're likely to come up.
  {
    key: 'cpmA',
    short: 'cpmA',
    folder: 'ask',
    label: 'Android CPM',
    unit: '$',
    kind: 'number',
    default: cpmFor('us').cpmA,
    min: 0,
    max: 500,
    step: 0.5,
    rangeIn: cpmRange('android'),
    source:
      'Price per 1,000 impressions incl. fees, derived from published eCPM reports (US $10–28)',
  },
  {
    key: 'cpmI',
    short: 'cpmI',
    folder: 'ask',
    label: 'iOS CPM',
    unit: '$',
    kind: 'number',
    default: cpmFor('us').cpmI,
    min: 0,
    max: 500,
    step: 0.5,
    rangeIn: cpmRange('ios'),
    source:
      'Price per 1,000 impressions incl. fees, derived from published eCPM reports (US $13–35)',
  },
  {
    key: 'tierOn',
    short: 'tier',
    folder: 'ask',
    label: 'target the high-value tier only',
    unit: '',
    kind: 'bool',
    default: false,
    source:
      'Only users in the top tier by past Link earnings (see Audience for its share and lifts)',
  },
  {
    key: 'horizon',
    short: 'fh',
    folder: 'ask',
    label: 'follow-on value counted',
    unit: '',
    kind: 'list',
    default: 'none',
    pess: 'none',
    opt: 'm12',
    options: [
      { value: 'none', text: 'First offer only' },
      { value: 'd90', text: '90 days' },
      { value: 'm12', text: '12 months' },
    ],
    source:
      'What a user we win back earns after the first offer: the number the case rests on. Ask Almedia',
  },
  {
    key: 'geoUs',
    short: 'us',
    folder: 'ask',
    label: 'US share of users',
    unit: '%',
    kind: 'number',
    default: 45,
    min: 0,
    max: 100,
    step: 1,
    pess: 30,
    opt: 60,
    source: "Ask Almedia. The US is 57.9% of lifetime payouts (Almedia's own figure)",
  },
  {
    key: 'geoEu',
    short: 'eu',
    folder: 'ask',
    label: 'EU share of users',
    unit: '%',
    kind: 'number',
    default: 35,
    min: 0,
    max: 100,
    step: 1,
    pess: 45,
    opt: 25,
    source: 'Ask Almedia. The rest of the world is the remainder',
  },
  {
    key: 'ladder',
    short: 'lad',
    folder: 'ask',
    label: 'offer',
    unit: '',
    kind: 'list',
    default: 'illustrative',
    pess: 'illustrative',
    opt: 'highValue',
    options: [
      { value: 'illustrative', text: 'Illustrative ladder' },
      { value: 'median', text: 'Median offer' },
      { value: 'highValue', text: 'High-value offer' },
      { value: 'premium', text: 'Premium offer (top 10%)' },
    ],
    source: "Loads the offer's goals into Offer details",
  },
  target('hot'),
  target('warm'),
  target('cold'),
  ...followOnRows('d90'),
  ...followOnRows('m12'),
  // Ad performance
  ...funnelParams('android'),
  ...funnelParams('ios'),
  // Audience
  {
    key: 'linkedUsers',
    short: 'n',
    folder: 'population',
    label: 'linked users',
    unit: 'users',
    kind: 'number',
    default: 1_000_000,
    min: 0,
    max: 1e9,
    step: 1000,
    source: 'The brief: 1M linked users',
  },
  {
    key: 'androidShare',
    short: 'and',
    folder: 'population',
    label: 'Android share',
    unit: '%',
    kind: 'slider',
    default: 66,
    min: 0,
    max: 100,
    step: 1,
    pess: 50,
    opt: 70,
    source: 'Download data suggests ~68/32: ask Almedia',
  },
  {
    key: 'idA',
    short: 'idA',
    folder: 'population',
    label: 'Android users with an ad ID',
    unit: '%',
    kind: 'slider',
    default: 95,
    min: 0,
    max: 100,
    step: 1,
    pess: 90,
    opt: 98,
    source: 'The Android ad ID is on by default',
  },
  {
    key: 'idI',
    short: 'idI',
    folder: 'population',
    label: 'iOS users with an ad ID',
    unit: '%',
    kind: 'slider',
    default: 36,
    min: 0,
    max: 100,
    step: 1,
    pess: 25,
    opt: 55,
    source: 'iOS tracking opt-in, ~39% for games',
  },
  {
    key: 'consentUs',
    short: 'cUs',
    folder: 'population',
    label: 'US users who consent',
    unit: '%',
    kind: 'slider',
    default: 92,
    min: 0,
    max: 100,
    step: 1,
    pess: 85,
    opt: 95,
    source: 'Opt-out rules for adults',
  },
  {
    key: 'consentEu',
    short: 'cEu',
    folder: 'population',
    label: 'EU users who consent',
    unit: '%',
    kind: 'slider',
    default: 35,
    min: 0,
    max: 100,
    step: 1,
    pess: 25,
    opt: 50,
    source: 'Opt-in rules: ~35–50%',
  },
  {
    key: 'consentRow',
    short: 'cRow',
    folder: 'population',
    label: 'rest-of-world users who consent',
    unit: '%',
    kind: 'slider',
    default: 60,
    min: 0,
    max: 100,
    step: 1,
    pess: 40,
    opt: 70,
    source: ASK,
  },
  {
    key: 'adults',
    short: 'ad',
    folder: 'population',
    label: 'adults, 18 and over',
    unit: '%',
    kind: 'slider',
    default: 80,
    min: 0,
    max: 100,
    step: 1,
    pess: 70,
    opt: 90,
    source: 'No benchmark; Freecash allows 16+',
  },
  {
    key: 'testUs',
    short: 'tUs',
    folder: 'population',
    label: 'test in the US',
    unit: '',
    kind: 'bool',
    default: true,
    source: 'Test plan: US first',
  },
  {
    key: 'testEu',
    short: 'tEu',
    folder: 'population',
    label: 'test in the EU',
    unit: '',
    kind: 'bool',
    default: false,
    source: "Held back until there's a consent flow and a privacy assessment",
  },
  {
    key: 'testRow',
    short: 'tRow',
    folder: 'population',
    label: 'test in the rest of the world',
    unit: '',
    kind: 'bool',
    default: false,
    source: 'Not in the first test',
  },
  {
    key: 'reachA',
    short: 'rA',
    folder: 'population',
    label: 'Android users with an ad ID reached in 14 days',
    unit: '%',
    kind: 'slider',
    default: toPct(LIST_REACH_14D.android),
    min: 0,
    max: 100,
    step: 1,
    pess: 37,
    opt: 63,
    source:
      'Share of users with an ad ID a campaign reaches: our estimate; no platform publishes list reach',
  },
  {
    key: 'reachI',
    short: 'rI',
    folder: 'population',
    label: 'iOS users with an ad ID reached in 14 days',
    unit: '%',
    kind: 'slider',
    default: toPct(LIST_REACH_14D.ios),
    min: 0,
    max: 100,
    step: 1,
    pess: 9,
    opt: 30,
    source: 'iOS lists reach few users: the game showing the ad also needs tracking allowed',
  },
  ...segmentRows(),
  ...tierRows(),
  // Offer details
  {
    key: 'completionScale',
    short: 'cs',
    folder: 'offer',
    label: 'goal completion vs plan',
    unit: '%',
    kind: 'slider',
    default: 100,
    min: 25,
    max: 200,
    step: 1,
    pess: 60,
    opt: 120,
    source:
      "Scales every goal's completion rate. The ladders' rates look high; ~82% matches the checked median",
  },
  {
    key: 'rewardsFromShare',
    short: 'rfs',
    folder: 'offer',
    label: 'reward = payout × user share',
    unit: '',
    kind: 'bool',
    default: false,
    source: "Off: each goal's own reward. On: the user gets the payout × the share below",
  },
  {
    key: 'userShare',
    short: 'ush',
    folder: 'offer',
    label: 'user share of payout',
    unit: '%',
    kind: 'slider',
    default: 50,
    min: 0,
    max: 100,
    step: 1,
    source: 'Published offerwall user shares run 40–61%; the ladders are built at 50%',
  },
  {
    key: 'eligibility',
    short: 'elig',
    folder: 'offer',
    label: 'users the offer accepts',
    unit: '%',
    unitText: '% ("new players only")',
    kind: 'slider',
    default: toPct(DEFAULT_ELIGIBILITY),
    min: 1,
    max: 100,
    step: 1,
    pess: 40,
    opt: 90,
    source: 'Most offers pay new players only: 67% of US Freecash offers carry the rule',
  },
  ...goalParams(),
  // Auction
  {
    key: 'region',
    short: 'reg',
    folder: 'market',
    label: 'market region',
    unit: '',
    kind: 'list',
    default: 'us',
    options: [
      { value: 'us', text: 'US' },
      { value: 'eu', text: 'EU' },
    ],
    source: "Picks the market prices and resets both CPMs to the region's typical price",
  },
  {
    key: 'buyMode',
    short: 'buy',
    folder: 'market',
    label: 'we pay per',
    unit: '',
    kind: 'list',
    default: 'cpm',
    options: [
      { value: 'cpm', text: 'Impressions (CPM)' },
      { value: 'cpa', text: 'Offer start (CPA)' },
      { value: 'revShare', text: 'Link Offers (revenue share)' },
    ],
    source:
      'Paying per offer start moves the click-through risk to the network; Link Offers pays the host studio a share of margin instead',
  },
  {
    key: 'revShare',
    short: 'rs',
    folder: 'market',
    label: 'revenue share to host studio',
    unit: '%',
    unitText: '% of net margin',
    kind: 'slider',
    default: 30,
    min: 0,
    max: 100,
    step: 1,
    pess: 30,
    opt: 20,
    source: "Link Offers only: the studio's share of the margin on every credited install",
  },
  {
    key: 'payoutEu',
    short: 'pEu',
    folder: 'market',
    label: 'EU offer payouts vs US',
    unit: '%',
    kind: 'slider',
    default: toPct(REGION_PAYOUT_MULTIPLIER.eu),
    min: 10,
    max: 150,
    step: 1,
    pess: 60,
    opt: 80,
    source: 'Same games pay less in Europe: UK and Germany ~80%, France ~60%, Poland ~38%',
  },
  {
    key: 'cpaAuto',
    short: 'cpaAuto',
    folder: 'market',
    label: 'bid what an offer start is worth',
    unit: '',
    kind: 'bool',
    default: true,
    source: 'On: bid what an offer start is worth, per segment. Off: the fixed CPAs below',
  },
  {
    key: 'cpaA',
    short: 'cpaA',
    folder: 'market',
    label: 'Android CPA',
    unit: '$',
    unitText: '$ per start',
    kind: 'number',
    default: 0.3,
    min: 0,
    max: 100,
    step: 0.01,
    source: 'Fixed price per offer start, used when the box above is off',
  },
  {
    key: 'cpaI',
    short: 'cpaI',
    folder: 'market',
    label: 'iOS CPA',
    unit: '$',
    unitText: '$ per start',
    kind: 'number',
    default: 0.15,
    min: 0,
    max: 100,
    step: 0.01,
    source: 'Fixed price per offer start, used when the box above is off',
  },
  {
    key: 'targetMargin',
    short: 'tm',
    folder: 'market',
    label: 'safety margin below value',
    unit: '%',
    kind: 'slider',
    default: toPct(DEFAULT_TARGET_MARGIN),
    min: 0,
    max: 90,
    step: 1,
    pess: 30,
    opt: 10,
    source: 'How far under its value we bid',
  },
  {
    key: 'frequencyCap',
    short: 'fc',
    folder: 'market',
    label: 'max ads per user',
    unit: '/day',
    kind: 'slider',
    default: DEFAULT_FREQUENCY_CAP,
    min: 1,
    max: 20,
    step: 1,
    pess: 1,
    opt: 3,
    source: 'Frequency cap',
  },
  {
    key: 'requests',
    short: 'rq',
    folder: 'market',
    label: 'ad slots per active user',
    unit: '/day',
    kind: 'slider',
    default: 6,
    min: 0.5,
    max: 50,
    step: 0.5,
    pess: 4,
    opt: 10,
    source: 'Full-screen ad chances per user-day in other games: ask the network',
  },
  {
    key: 'dailyActive',
    short: 'da',
    folder: 'market',
    label: 'reached users active on a given day',
    unit: '%',
    kind: 'slider',
    default: 40,
    min: 1,
    max: 100,
    step: 1,
    pess: 30,
    opt: 55,
    source: ASK,
  },
  {
    key: 'testDays',
    short: 'td',
    folder: 'market',
    label: 'test length',
    unit: 'days',
    kind: 'slider',
    default: 14,
    min: 1,
    max: 90,
    step: 1,
    source: 'Test plan: 14 days of ads',
  },
  {
    key: 'winMax',
    short: 'wmax',
    folder: 'market',
    group: 'Win curve',
    label: 'share of ad requests open to our bid',
    unit: '%',
    kind: 'slider',
    default: 80,
    min: 1,
    max: 100,
    step: 1,
    source:
      "Of a reached user's ad requests, the share open to an outside bid at any price (the rest go to direct deals, first-look or exchanges we don't buy). Our estimate; only matters at low bids when the frequency cap binds",
  },
  {
    key: 'winSteep',
    short: 'wk',
    folder: 'market',
    group: 'Win curve',
    label: 'steepness',
    unit: '',
    kind: 'slider',
    default: 2.5,
    min: 0.5,
    max: 8,
    step: 0.1,
    source: 'Shape of the win curve: our estimate (form from Zhang et al., KDD 2014)',
  },
  {
    key: 'platformFee',
    short: 'fee',
    folder: 'market',
    group: 'Win curve',
    label: 'platform fee',
    unit: '%',
    kind: 'slider',
    default: toPct(DEFAULT_PLATFORM_FEE),
    min: 0,
    max: 90,
    step: 1,
    pess: 35,
    opt: 15,
    source:
      'Share of the CPM we pay that the DSP or network keeps; the auction sees the rest of our bid',
  },
  medianRow('us', 'android'),
  medianRow('us', 'ios'),
  medianRow('eu', 'android'),
  medianRow('eu', 'ios'),
  // Judgement calls
  {
    key: 'followOnCeiling',
    short: 'fmax',
    folder: 'thresholds',
    label: 'highest credible follow-on value',
    unit: '$',
    unitText: '$ per user',
    kind: 'number',
    default: 20,
    min: 0,
    max: 1000,
    step: 1,
    source:
      'Top of the blended 12-month follow-on range ($1.5–20); excludes the hot-only optimistic corner ($23.9)',
  },
  {
    key: 'minWin',
    short: 'mw',
    folder: 'thresholds',
    label: 'minimum auction win rate',
    unit: '%',
    kind: 'slider',
    default: 5,
    min: 0,
    max: 80,
    step: 0.5,
    source: 'Below this a cheap bid barely delivers any impressions',
  },
  // Test design
  {
    key: 'holdout',
    short: 'ho',
    folder: 'experiment',
    label: 'holdout share',
    unit: '%',
    kind: 'slider',
    default: DEFAULT_HOLDOUT_PCT,
    min: 5,
    max: 50,
    step: 1,
    source: '20%, because margin per user is noisy',
  },
  {
    key: 'budget',
    short: 'bud',
    folder: 'experiment',
    label: 'test budget',
    unit: '$',
    kind: 'number',
    default: 5000,
    min: 0,
    max: 1e8,
    step: 100,
    source: 'Test plan: $5k cap',
  },
  {
    key: 'sd',
    short: 'sd',
    folder: 'experiment',
    label: 'margin spread per user',
    unit: '$',
    unitText: '$, std dev',
    kind: 'number',
    default: 2,
    min: 0.01,
    max: 1000,
    step: 0.1,
    pess: 3,
    opt: 1,
    source: 'Our estimate: measure it from historical margin per linked user',
  },
  {
    key: 'alpha',
    short: 'al',
    folder: 'experiment',
    label: 'significance level',
    unit: '%',
    kind: 'slider',
    default: 5,
    min: 0.1,
    max: 20,
    step: 0.1,
    source: 'Two-sided; 95% confidence, set before the test',
  },
  {
    key: 'power',
    short: 'pw',
    folder: 'experiment',
    label: 'statistical power',
    unit: '%',
    kind: 'slider',
    default: 80,
    min: 50,
    max: 99,
    step: 1,
    source: 'Convention',
  },
];

export const BY_KEY: ReadonlyMap<string, Param> = new Map(PARAMS.map((p) => [p.key, p]));
export const BY_SHORT: ReadonlyMap<string, Param> = new Map(PARAMS.map((p) => [p.short, p]));
export const DEFAULTS: Params = Object.fromEntries(PARAMS.map((p) => [p.key, p.default]));

/** The row for `key`. An unknown key is a programming error, so it throws. */
export function param(key: string): Param {
  const p = BY_KEY.get(key);
  if (!p) throw new Error(`unknown param ${key}`);
  return p;
}

/** The value of `key` in `params`. A missing value is a programming error, so it throws. */
export function paramValue(params: Params, key: string): Value {
  const v = params[key];
  if (v === undefined) throw new Error(`no value for param ${key}`);
  return v;
}

/** A row's conservative (pess) or upside (opt) value under `params`, or undefined if it has no range. */
export const rangeValue = (p: Param, column: keyof RangeEnds, params: Params): Value | undefined =>
  p.rangeIn ? p.rangeIn(params)[column] : p[column];

/** Is `v` a legal value for `p`? Numbers must be finite and inside [min, max]. */
export function isValid(p: Param, v: Value): boolean {
  if (p.kind === 'bool') return v === true || v === false;
  if (p.kind === 'list') return p.options.some((o) => o.value === v);
  return Number.isFinite(v) && Number(v) >= p.min && Number(v) <= p.max;
}

/** Snap an out-of-range number to its nearest bound (number inputs aren't clamped by Tweakpane). */
export function clampToParam(p: Param, v: Value): Value {
  if (p.kind !== 'slider' && p.kind !== 'number') return v;
  if (isValid(p, v)) return v;
  const x = Number(v);
  if (!Number.isFinite(x)) return p.default;
  return Math.min(p.max, Math.max(p.min, x));
}

/**
 * Setting a param can load others: a ladder preset fills the goal rows, a region resets the
 * CPMs paid to its base. Returns the full set of changes.
 */
export function withCouplings(key: string, value: Value): Params {
  const out: Params = { [key]: value };
  if (key === 'ladder')
    for (let i = 0; i < MAX_GOALS; i++) Object.assign(out, goalValues(String(value), i));
  if (key === 'region') Object.assign(out, cpmFor(regionIn(out)));
  return out;
}

/** Apply one change plus its couplings. */
export const applyParam = (params: Params, key: string, value: Value): Params => ({
  ...params,
  ...withCouplings(key, value),
});

/** Keys whose value differs from `base`. */
export const diffKeys = (params: Params, base: Params = DEFAULTS): string[] =>
  PARAMS.flatMap((p) => (params[p.key] === base[p.key] ? [] : [p.key]));
