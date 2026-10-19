/**
 * How an input's citations read, as plain strings: the basis label, the judgement flag,
 * "Publisher — Title (date)", the short quote and the marker after the input's label in the rail.
 * The citation data and its types live in citations.ts; the DOM views in sources-view.ts. An input
 * with no entry reads "No citation recorded yet" rather than failing, so a new param still renders.
 */
import type { Basis, Citations, Publication } from './citations';
import { cap } from './names';
import { BY_KEY, PARAMS } from './params';
import type { ValueSource } from './provenance';

export const BASIS_LABEL: Record<Basis, string> = {
  brief: 'From the brief',
  source: 'From published sources',
  derived: 'Derived from published sources',
  estimate: 'Our estimate',
  'design choice': 'Design choice',
  'partner data needed': 'Needs partner data',
};

/** Bases that mark an input as a judgement call rather than a sourced figure. */
export const JUDGEMENT: Partial<Record<Basis, string>> = {
  estimate: 'estimate',
  'partner data needed': 'ask Almedia',
};

/** "Publisher — Title (date)". */
export const sourceLine = (s: Publication): string =>
  `${s.publisher} — ${s.title}${s.date ? ` (${s.date})` : ''}`;

const QUOTE_MAX = 220;

/** The supporting passage, trimmed to a short quote (without quotation marks). */
export function passage(s: Publication): string {
  const t = s.supports.trim().replace(/\s+/g, ' ');
  return t.length > QUOTE_MAX ? `${t.slice(0, QUOTE_MAX - 1).trimEnd()}…` : t;
}

/** Keys of params with no citation entry (shown as a count in the panel heading). */
export const uncited = (citations: Citations): string[] =>
  PARAMS.flatMap((p) => (citations[p.key] ? [] : [p.key]));

/** The marker word for an input with no published source. */
const BASIS_WORD: Record<Basis, string> = {
  brief: 'Brief',
  'design choice': 'Design choice',
  source: 'Derived',
  derived: 'Derived',
  estimate: 'Estimate',
  'partner data needed': 'Ask Almedia',
};

/** The marker after an input's label: its text, its judgement flag if any, and its tooltip. */
export type Marker = { text: string; flag?: string; title: string };

/**
 * The source marker after an input's label in the rail. A partner-supplied or assumed value says
 * so; a default value shows its judgement flag ("Estimate", "Ask Almedia"), else its source count
 * as a footnote ("[2]"), else its basis in a word.
 */
export function markerFor(citations: Citations, key: string, source: ValueSource): Marker {
  if (source === 'partner')
    return { text: 'Partner', title: 'Partner-supplied value. Click for its sources or to edit' };
  if (source === 'assumption')
    return {
      text: 'Assumption',
      title: 'Changed without a source. Click for its sources or to edit',
    };
  const c = BY_KEY.has(key) ? citations[key] : undefined;
  if (!c) return { text: 'Source', title: 'No citation recorded yet. Click for details' };
  const flag = JUDGEMENT[c.basis];
  if (flag) return { text: cap(flag), flag, title: `${BASIS_LABEL[c.basis]}. Click for details` };
  const n = c.sources.length;
  if (n)
    return { text: `[${n}]`, title: `${n} ${n === 1 ? 'source' : 'sources'}. Click to read them` };
  return { text: BASIS_WORD[c.basis], title: `${BASIS_LABEL[c.basis]}. Click for details` };
}
