/**
 * Where each input's current value came from. A value is "default" when it equals its cited
 * default and nothing says otherwise, an "assumption" when it was changed without a source, or
 * whatever was set explicitly in the source editor ("partner", with a note and a date). Every
 * param gets this for free because it is data over the param table.
 */
import { DEFAULTS, diffKeys, PARAMS, type Params } from './params';

export const VALUE_SOURCES = ['default', 'partner', 'assumption'] as const;
export type ValueSource = (typeof VALUE_SOURCES)[number];

export const SOURCE_LABEL: Record<ValueSource, string> = {
  default: 'Default (see Sources)',
  partner: 'Partner-supplied',
  assumption: 'Assumption',
};

export type Provenance = { source: ValueSource; note?: string; date?: string }; // date: YYYY-MM-DD

/** Explicit provenance by param key; a key with no entry takes its implicit source. */
export interface ProvenanceMap {
  [key: string]: Provenance;
}

/** Where `key`'s current value came from. */
export const provenanceOf = (key: string, params: Params, provenance: ProvenanceMap): Provenance =>
  provenance[key] ?? { source: params[key] === DEFAULTS[key] ? 'default' : 'assumption' };

/** Keys worth listing under "Your numbers": changed from Working assumptions, or given a source. */
export function notedKeys(params: Params, provenance: ProvenanceMap): string[] {
  const changed = new Set(diffKeys(params));
  return PARAMS.flatMap((p) => {
    const explicit = provenance[p.key]?.source;
    const noted = changed.has(p.key) || (explicit !== undefined && explicit !== 'default');
    return noted ? [p.key] : [];
  });
}

/** `provenance` without the entries for `keys` (after a reset to the default value). */
export const withoutKeys = (provenance: ProvenanceMap, keys: string[]): ProvenanceMap =>
  Object.fromEntries(Object.entries(provenance).filter(([k]) => !keys.includes(k)));

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The entry the source editor's fields describe for `key`, or null when it says no more than the
 * key's implicit source (no note, no date). A date is kept only when it is YYYY-MM-DD.
 */
export function editedEntry(
  key: string,
  params: Params,
  source: ValueSource,
  note: string,
  date: string,
): Provenance | null {
  const entry: Provenance = { source };
  if (note.trim()) entry.note = note.trim();
  if (ISO_DATE.test(date.trim())) entry.date = date.trim();
  const implicit = provenanceOf(key, params, {}).source;
  return source === implicit && !entry.note && !entry.date ? null : entry;
}
