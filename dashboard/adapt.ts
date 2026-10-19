/**
 * The one adapter between UI params (percent, dollars) and the model's Scenario (fractions,
 * micros). It only converts units and picks fields; the model does every calculation. Reading a
 * key that has no value throws, so a typo can't silently become a constant.
 */
import { REGIONS } from '../src/model/market';
import { BUY_MODES, HORIZONS, type Scenario, type Variant } from '../src/model/scenario-types';
import { formatValue } from './param-text';
import {
  applyParam,
  LADDERS,
  listValue,
  MAX_GOALS,
  PARAMS,
  type Params,
  paramValue,
  rangeValue,
  type Value,
} from './params';
import { fromPct, fromUsd } from './units';

export function toScenario(p: Params): Scenario {
  const n = (key: string) => Number(paramValue(p, key));
  const pct = (key: string) => fromPct(n(key));
  const usd = (key: string) => fromUsd(n(key));
  const b = (key: string) => paramValue(p, key) === true;
  const ladder = String(paramValue(p, 'ladder'));

  return {
    population: {
      linkedUsers: n('linkedUsers'),
      androidShare: pct('androidShare'),
      usableId: { android: pct('idA'), ios: pct('idI') },
      geoShare: { us: pct('geoUs'), eu: pct('geoEu') },
      consent: { us: pct('consentUs'), eu: pct('consentEu'), row: pct('consentRow') },
      adults: pct('adults'),
      inTest: { us: b('testUs'), eu: b('testEu'), row: b('testRow') },
      listReach: { android: pct('reachA'), ios: pct('reachI') },
    },
    segments: {
      days: { hot: n('daysHot'), warm: n('daysWarm') },
      share: { hot: pct('shareH'), warm: pct('shareW'), cold: pct('shareC') },
      lift: {
        hot: { ctr: n('liftHCtr'), startRate: n('liftHStart'), incrementality: n('liftHIncr') },
        warm: { ctr: n('liftWCtr'), startRate: n('liftWStart'), incrementality: n('liftWIncr') },
        cold: { ctr: n('liftCCtr'), startRate: n('liftCStart'), incrementality: n('liftCIncr') },
      },
      target: { hot: b('targetH'), warm: b('targetW'), cold: b('targetC') },
    },
    valueTier: {
      highOnly: b('tierOn'),
      share: pct('tierShare'),
      lift: {
        ctr: n('tierCtr'),
        startRate: n('tierStart'),
        incrementality: n('tierIncr'),
        margin: n('tierMargin'),
        followOn: n('tierFollowOn'),
      },
    },
    funnel: {
      android: {
        ctr: pct('ctrA'),
        startRate: pct('startA'),
        installRate: pct('installA'),
        attributedRate: pct('credA'),
        incrementality: pct('incrA'),
      },
      ios: {
        ctr: pct('ctrI'),
        startRate: pct('startI'),
        installRate: pct('installI'),
        attributedRate: pct('credI'),
        incrementality: pct('incrI'),
      },
    },
    offer: {
      ladder,
      goals: Array.from({ length: MAX_GOALS }, (_, i) => ({
        label: LADDERS.get(ladder)?.[i]?.label ?? `Goal ${i + 1}`,
        payout: usd(`goal${i}Payout`),
        reward: usd(`goal${i}Reward`),
        completionRate: pct(`goal${i}Completion`),
        enabled: b(`goal${i}On`),
      })),
      completionScale: pct('completionScale'),
      rewardsFromShare: b('rewardsFromShare'),
      userShare: pct('userShare'),
      eligibility: pct('eligibility'),
    },
    followOn: {
      horizon: listValue(p, 'horizon', HORIZONS),
      value: {
        d90: { hot: usd('followOn90H'), warm: usd('followOn90'), cold: usd('followOn90C') },
        m12: { hot: usd('followOn12H'), warm: usd('followOn12'), cold: usd('followOn12C') },
      },
      ceiling: usd('followOnCeiling'),
    },
    market: {
      region: listValue(p, 'region', REGIONS),
      cpm: { android: usd('cpmA'), ios: usd('cpmI') },
      medianClearing: {
        us: { android: usd('medianUsA'), ios: usd('medianUsI') },
        eu: { android: usd('medianEuA'), ios: usd('medianEuI') },
      },
      winCurve: { maxShare: pct('winMax'), steepness: n('winSteep') },
      platformFee: pct('platformFee'),
      minWinRate: pct('minWin'),
      buyMode: listValue(p, 'buyMode', BUY_MODES),
      cpaAuto: b('cpaAuto'),
      cpa: { android: usd('cpaA'), ios: usd('cpaI') },
      revShare: pct('revShare'),
      euPayout: pct('payoutEu'),
      targetMargin: pct('targetMargin'),
      frequencyCap: n('frequencyCap'),
      requestsPerDay: n('requests'),
      dailyActiveShare: pct('dailyActive'),
      testDays: n('testDays'),
    },
    experiment: {
      holdoutPct: n('holdout'),
      budget: usd('budget'),
      sd: usd('sd'),
      alpha: pct('alpha'),
      power: pct('power'),
    },
  };
}

/** One tornado variant per param with a conservative/upside value under `p`, couplings applied. */
export function variantsFor(p: Params): Variant[] {
  return PARAMS.flatMap((x) => {
    const low = rangeValue(x, 'pess', p);
    const high = rangeValue(x, 'opt', p);
    if (low === undefined || high === undefined || low === high) return [];
    const variant = (v: Value) => toScenario(applyParam(p, x.key, v));
    const label =
      x.group && !x.label.includes(x.group.toLowerCase()) ? `${x.group} ${x.label}` : x.label;
    return [
      {
        key: x.key,
        label,
        lowText: formatValue(x, low),
        highText: formatValue(x, high),
        low: variant(low),
        high: variant(high),
      },
    ];
  });
}
