/**
 * The source editor: a popover where an input's value is marked as the default, partner-supplied
 * or an assumption, with a note and a date, next to the input's citations. Edits go to the
 * provenance store as they are typed; an entry that says no more than the input's implicit source
 * is dropped. Escape, Done or a click elsewhere closes it.
 */
import type { Citations } from './citations';
import { byId, byIdAs } from './dom';
import { formatValue, paramName } from './param-text';
import { type Params, param, paramValue } from './params';
import {
  editedEntry,
  type Provenance,
  type ProvenanceMap,
  provenanceOf,
  VALUE_SOURCES,
  type ValueSource,
  withoutKeys,
} from './provenance';
import { citationBlock } from './sources-view';
import type { Store } from './store';

/** Pixels the popover keeps from the window's edges and from what it opens beside. */
const EDGE = 8;

const today = () => new Date().toISOString().slice(0, 10);

/** Open beside the rail, level with the row, so the inputs stay visible; else below (or above) the anchor. */
function place(pop: HTMLElement, anchor: HTMLElement) {
  const r = anchor.getBoundingClientRect();
  const w = pop.offsetWidth;
  const ht = pop.offsetHeight;
  const rail = anchor.closest('.rail')?.getBoundingClientRect();
  if (rail && rail.left > w + 2 * EDGE) {
    pop.style.left = `${rail.left - w - EDGE}px`;
    pop.style.top = `${Math.max(EDGE, Math.min(r.top - 2 * EDGE, window.innerHeight - ht - EDGE))}px`;
    return;
  }
  const fitsBelow = r.bottom + ht + EDGE <= window.innerHeight;
  pop.style.left = `${Math.max(EDGE, Math.min(r.left, window.innerWidth - w - EDGE))}px`;
  pop.style.top = `${fitsBelow ? r.bottom + EDGE / 2 : Math.max(EDGE, r.top - ht - EDGE / 2)}px`;
}

export function mountSourceEditor(
  params: Store<Params>,
  sources: Store<ProvenanceMap>,
  citations: Citations,
) {
  const pop = byId('prov');
  const noteInput = byIdAs('prov-note', HTMLInputElement);
  const dateInput = byIdAs('prov-date', HTMLInputElement);
  const radios = () => [...pop.querySelectorAll<HTMLInputElement>('input[name="prov-source"]')];
  let editing: string | null = null;

  function open(key: string, anchor: HTMLElement) {
    editing = key;
    const prov = provenanceOf(key, params.get(), sources.get());
    byId('prov-title').textContent =
      `${paramName(key)}: ${formatValue(param(key), paramValue(params.get(), key))}`;
    byId('prov-cite').replaceChildren(citationBlock(citations, key, true));
    for (const r of radios()) r.checked = r.value === prov.source;
    noteInput.value = prov.note ?? '';
    dateInput.value = prov.date ?? '';
    pop.hidden = false;
    place(pop, anchor);
    radios()
      .find((r) => r.checked)
      ?.focus({ preventScroll: true });
    pop.scrollTop = 0;
  }

  /** The source radio that is checked, decoded. */
  const checkedSource = () => {
    const value = radios().find((r) => r.checked)?.value;
    return VALUE_SOURCES.find((s) => s === value);
  };

  /** A partner value is dated today when the date field is empty. */
  const datePartner = (source: ValueSource) => {
    if (source === 'partner' && !dateInput.value) dateInput.value = today();
  };

  /** Replace `key`'s entry, or drop it (null). */
  const store = (key: string, entry: Provenance | null) => {
    const rest = withoutKeys(sources.get(), [key]);
    sources.replace(entry ? { ...rest, [key]: entry } : rest);
  };

  /** Write the fields back as the key's entry. */
  function apply() {
    const source = checkedSource();
    if (editing === null || !source) return;
    datePartner(source);
    store(editing, editedEntry(editing, params.get(), source, noteInput.value, dateInput.value));
  }

  function close() {
    pop.hidden = true;
    editing = null;
  }

  pop.addEventListener('input', apply);
  pop.addEventListener('change', apply);
  byId('prov-done').addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !pop.hidden) close();
  });
  // A click outside closes it, except on another source marker or pill, which reopens it.
  const opensEditor = (t: Element) => pop.contains(t) || t.closest('.prov, .pill-main') !== null;
  document.addEventListener('pointerdown', (e) => {
    if (!pop.hidden && e.target instanceof Element && !opensEditor(e.target)) close();
  });

  return { open };
}
