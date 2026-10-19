/**
 * The text format for what the page keeps in localStorage: the last session and saved scenarios.
 * Each is a query string holding the link (link-format.ts), the notes and, for a saved scenario,
 * its id, name and description; a saved-scenario list is one scenario per line. Reusing the link's
 * format means input from storage is decoded and checked exactly like a pasted URL.
 */
import { decodeLink, encodeLink, encodeProvenance } from './link-format';
import { BY_SHORT, PARAMS, type Params } from './params';
import type { Provenance, ProvenanceMap } from './provenance';

const MAX_NOTE = 200;
const MAX_NAME = 60;

/** Notes by short key, as a query string: "cpmA=average+Moloco+US+Q3". */
function encodeNotes(provenance: ProvenanceMap): string {
  const q = new URLSearchParams();
  for (const p of PARAMS) {
    const note = provenance[p.key]?.note?.trim();
    if (note) q.set(p.short, note);
  }
  return q.toString();
}

/** Attach stored notes to the provenance entries they belong to; a note with no entry is dropped. */
function withNotes(provenance: ProvenanceMap, notes: string): ProvenanceMap {
  const out: ProvenanceMap = { ...provenance };
  for (const [short, text] of new URLSearchParams(notes)) {
    const p = BY_SHORT.get(short);
    const entry = p && out[p.key];
    const note = text.trim().slice(0, MAX_NOTE);
    if (p && entry && note) out[p.key] = noted(entry, note);
  }
  return out;
}

const noted = (entry: Provenance, note: string): Provenance => ({ ...entry, note });

/** Do these two provenance maps say the same thing (sources, dates and notes)? */
export const sameProvenance = (a: ProvenanceMap, b: ProvenanceMap): boolean =>
  encodeProvenance(a) === encodeProvenance(b) && encodeNotes(a) === encodeNotes(b);

export type State = { params: Params; provenance: ProvenanceMap };

const putState = (q: URLSearchParams, s: State) => {
  q.set('link', encodeLink(s.params, s.provenance));
  q.set('notes', encodeNotes(s.provenance));
};

function takeState(q: URLSearchParams): State {
  const link = decodeLink(q.get('link') ?? '');
  return { params: link.params, provenance: withNotes(link.provenance, q.get('notes') ?? '') };
}

/** The last session: which scenario was active, and the inputs on screen. */
export type Session = State & { active: string };

export function encodeSession(s: Session): string {
  const q = new URLSearchParams({ active: s.active });
  putState(q, s);
  return q.toString();
}

/** A stored session, or null when the text holds none. */
export function decodeSession(text: string): Session | null {
  const q = new URLSearchParams(text);
  const active = q.get('active');
  return active ? { active, ...takeState(q) } : null;
}

/** A user's saved scenario as stored. */
export type StoredScenario = State & { id: string; name: string; description: string };

export const cleanName = (name: string): string => name.trim().slice(0, MAX_NAME);

const encodeStored = (s: StoredScenario): string => {
  const q = new URLSearchParams({ id: s.id, name: s.name, desc: s.description });
  putState(q, s);
  return q.toString();
};

/** A stored scenario, or null when a line has no id or name. */
function decodeStored(line: string): StoredScenario | null {
  const q = new URLSearchParams(line);
  const id = q.get('id');
  const name = cleanName(q.get('name') ?? '');
  return id && name ? { id, name, description: q.get('desc') ?? '', ...takeState(q) } : null;
}

/** Saved scenarios, one per line. */
export const encodeSavedList = (list: StoredScenario[]): string =>
  list.map(encodeStored).join('\n');

export const decodeSavedList = (text: string): StoredScenario[] =>
  text.split('\n').flatMap((line) => {
    const s = decodeStored(line);
    return s ? [s] : [];
  });
