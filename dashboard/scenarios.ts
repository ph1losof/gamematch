/**
 * Scenarios: a full set of param values plus where each value came from. Built in: Working
 * assumptions (every default), Conservative and Upside (each param's pess/opt column, couplings
 * applied), and one per opportunity we model (high-value tier × premium offer, outcome buying, Link
 * Offers revenue share, EU add-on), each a few params moved from the defaults. People save their
 * own; "Partner inputs" is the one that holds what Almedia supplies, saved from the current inputs.
 * Saved scenarios persist through a TextStore in stored-format.ts's text format.
 */

import {
  applyParam,
  DEFAULTS,
  diffKeys,
  HOT_UPSIDE,
  PARAMS,
  type Params,
  type RangeEnds,
  rangeValue,
} from './params';
import type { ProvenanceMap } from './provenance';
import { STORAGE_KEYS, type TextStore } from './storage';
import {
  cleanName,
  decodeSavedList,
  encodeSavedList,
  type StoredScenario,
  sameProvenance,
} from './stored-format';

export type SavedScenario = StoredScenario & { builtIn: boolean };

export const WORKING = 'working';
export const PARTNER = 'partner';
const PARTNER_NAME = 'Partner inputs';
const PARTNER_DESCRIPTION = 'Values supplied by Almedia, saved from the current inputs.';
const SAVED_DESCRIPTION = 'Saved scenario.';

/** Every param that has a range at its `column` end, in table order, couplings applied. */
function fromColumn(column: keyof RangeEnds): Params {
  let params = { ...DEFAULTS };
  for (const p of PARAMS) {
    const v = rangeValue(p, column, params);
    if (v !== undefined) params = applyParam(params, p.key, v);
  }
  return params;
}

/** The defaults with some params moved, couplings applied (a ladder loads its goals, a region its CPMs). */
function moved(changes: Params): Params {
  let params = { ...DEFAULTS };
  for (const [k, v] of Object.entries(changes)) params = applyParam(params, k, v);
  return params;
}

/** The best opportunity: high past earners, a top-decile offer, warm and hot, US, no follow-on value. */
const BEST: Params = { tierOn: true, ladder: 'premium', targetC: false, horizon: 'none' };

/** Notes that replace a built-in's note for one key: why an end of a range is where it is. */
const HOT_NOTE = 'Optimistic: above Hillstrom (×1.27 visits, ×1.55 conversions)';
const KEY_NOTES: ReadonlyMap<string, string> = new Map([
  ['liftHCtr', `${HOT_NOTE}; ×${HOT_UPSIDE.ctr} with starts ×${HOT_UPSIDE.startRate}`],
  ['liftHStart', `${HOT_NOTE}; ×${HOT_UPSIDE.startRate} with click-through ×${HOT_UPSIDE.ctr}`],
]);

/** Built-in scenarios mark their moved values as defaults, noting which end of the range. */
function builtIn(
  id: string,
  name: string,
  description: string,
  params: Params,
  note: string,
): SavedScenario {
  const provenance: ProvenanceMap = Object.fromEntries(
    diffKeys(params).map((k) => [k, { source: 'default', note: KEY_NOTES.get(k) ?? note }]),
  );
  return { id, name, description, builtIn: true, params, provenance };
}

/** Working assumptions: every input at its default. Shown for an id that no longer exists. */
export const WORKING_SCENARIO = builtIn(
  WORKING,
  'Working assumptions',
  'Base case: every input at its default.',
  { ...DEFAULTS },
  '',
);

export const BUILT_INS: SavedScenario[] = [
  WORKING_SCENARIO,
  builtIn(
    'conservative',
    'Conservative',
    'Every input that has a range at its cautious end.',
    fromColumn('pess'),
    'Cautious end of the range',
  ),
  builtIn(
    'upside',
    'Upside',
    'Every input that has a range at its favourable end.',
    fromColumn('opt'),
    'Favourable end of the range',
  ),
  builtIn(
    'bestCell',
    'High-value × premium, US Android',
    'Top-tier past earners, warm and hot, shown a premium offer in the US, with no follow-on value. Read the Android row.',
    moved(BEST),
    'Opportunity scenario',
  ),
  builtIn(
    'premium',
    'Premium offer mix',
    'Every user shown a premium (top-decile) offer instead of the illustrative one.',
    moved({ ladder: 'premium' }),
    'Opportunity scenario',
  ),
  builtIn(
    'outcome',
    'Outcome buying (billed per action)',
    'Paying per offer start at what a start is worth, if a network bills per action.',
    moved({ buyMode: 'cpa', cpaAuto: true }),
    'Opportunity scenario',
  ),
  builtIn(
    'linkOffers',
    'Link Offers revenue share (30%)',
    'The Offers screen in Link games, paying the host studio 30% of net margin instead of buying impressions.',
    moved({ buyMode: 'revShare', revShare: 30 }),
    'Opportunity scenario',
  ),
  // Germany: CPMs at ~0.65× the US ($17 → $11, $21 → $13.5), payouts at 0.8×.
  builtIn(
    'euGermany',
    'EU add-on (Germany)',
    'The high-value × premium group in Germany: lower CPMs and payouts, opt-in consent.',
    moved({
      ...BEST,
      testUs: false,
      testEu: true,
      region: 'eu',
      cpmA: 11,
      cpmI: 13.5,
      payoutEu: 80,
    }),
    'Opportunity scenario',
  ),
];

/**
 * User scenarios over a TextStore (localStorage in the page, a Map in tests). Built-ins are
 * read-only: saving over one, renaming or deleting it is refused (returns undefined/false).
 */
export function createScenarioStore(
  storage: TextStore,
  newId: () => string = () =>
    `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
) {
  let user: StoredScenario[] = decodeSavedList(storage.read(STORAGE_KEYS.saved) ?? '');
  const persist = () => storage.write(STORAGE_KEYS.saved, encodeSavedList(user));
  const find = (id: string) => user.find((s) => s.id === id);
  const asSaved = (s: StoredScenario): SavedScenario => ({ ...s, builtIn: false });
  const add = (s: StoredScenario): SavedScenario => {
    user.push(s);
    persist();
    return asSaved(s);
  };
  const copy = (
    id: string,
    name: string,
    description: string,
    params: Params,
    provenance: ProvenanceMap,
  ): StoredScenario => ({
    id,
    name,
    description,
    params: { ...params },
    provenance: { ...provenance },
  });

  const get = (id: string): SavedScenario | undefined => {
    const stored = find(id);
    return BUILT_INS.find((s) => s.id === id) ?? (stored && asSaved(stored));
  };
  /** Overwrite a user scenario's values. */
  const save = (
    id: string,
    params: Params,
    provenance: ProvenanceMap,
  ): SavedScenario | undefined => {
    const s = find(id);
    if (!s) return undefined;
    s.params = { ...params };
    s.provenance = { ...provenance };
    persist();
    return asSaved(s);
  };

  return {
    /** Built-ins first, then Partner inputs, then the rest in creation order. */
    all: (): SavedScenario[] => [
      ...BUILT_INS,
      ...user.flatMap((s) => (s.id === PARTNER ? [asSaved(s)] : [])),
      ...user.flatMap((s) => (s.id === PARTNER ? [] : [asSaved(s)])),
    ],
    get,
    save,
    saveAs(name: string, params: Params, provenance: ProvenanceMap): SavedScenario | undefined {
      const n = cleanName(name);
      return n ? add(copy(newId(), n, SAVED_DESCRIPTION, params, provenance)) : undefined;
    },
    /** Create or overwrite Partner inputs from the current values. */
    savePartner(params: Params, provenance: ProvenanceMap): SavedScenario {
      return (
        save(PARTNER, params, provenance) ??
        add(copy(PARTNER, PARTNER_NAME, PARTNER_DESCRIPTION, params, provenance))
      );
    },
    rename(id: string, name: string): boolean {
      const s = find(id);
      const n = cleanName(name);
      if (!s || !n) return false;
      s.name = n;
      persist();
      return true;
    },
    /** A user copy of any scenario, built-ins included. */
    duplicate(id: string): SavedScenario | undefined {
      const s = get(id);
      return (
        s &&
        add(copy(newId(), cleanName(`${s.name} (copy)`), SAVED_DESCRIPTION, s.params, s.provenance))
      );
    },
    remove(id: string): boolean {
      const before = user.length;
      user = user.filter((s) => s.id !== id);
      if (user.length === before) return false;
      persist();
      return true;
    },
  };
}

export type ScenarioStore = ReturnType<typeof createScenarioStore>;

/** Do these values and sources match the saved scenario? (Drives the "edited" mark.) */
export const matches = (s: SavedScenario, params: Params, provenance: ProvenanceMap): boolean =>
  diffKeys(params, s.params).length === 0 && sameProvenance(s.provenance, provenance);
