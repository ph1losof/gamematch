/**
 * Builds the input rail from the param table and bridges it to the store. Everything here is
 * driven by data: FOLDERS (order, which open), PARAMS (rows in table order, `group` sub-folders,
 * labels, units, sources as tooltips) and READOUTS below, so a new param needs no code here.
 *
 * Tweakpane binds to a mutable "shadow" copy of the params; user edits go to the store, and
 * store-side changes (scenarios, resets, couplings) are written back into the shadow followed by
 * refresh(), guarded so a refresh doesn't loop back as an edit. Fields people dictate are number
 * inputs without min/max, because Tweakpane sliders clamp typed values; clampToParam bounds them.
 *
 * Each row carries a source marker after its label (text from markerFor in sources.ts: "[2]",
 * "Estimate", "Ask Almedia", "Partner", "Assumption"). Clicking it opens the source editor.
 */
import type { BindingApi, BindingParams, FolderApi } from '@tweakpane/core';
import { Pane } from 'tweakpane';
import type { Outputs } from '../src/model/scenario-types';
import { pct } from './format';
import { cap } from './names';
import { formatValue } from './param-text';
import {
  FOLDERS,
  type FolderId,
  LADDERS,
  PARAMS,
  type Param,
  type Params,
  paramValue,
  rangeValue,
  type Value,
} from './params';
import { type ProvenanceMap, provenanceOf, type ValueSource } from './provenance';
import type { Marker } from './sources';

export type PaneHandlers = {
  change(key: string, value: Value): void;
  resetFolder(folder: FolderId): void;
  source(key: string, anchor: HTMLElement): void;
};

/** A read-only row computed from the outputs, shown right after the param it explains. */
type Readout = { after: string; label: string; value: (o: Outputs) => string };
const READOUTS: Readout[] = [
  { after: 'geoEu', label: 'Rest of world', value: (o) => pct(o.geo.row, 0) },
];

const UNIT_TEXT: Record<Param['unit'], string> = {
  '%': '%',
  $: '$',
  '×': '×',
  users: '',
  days: 'days',
  '/day': 'per day',
  '': '',
};

/** Decimal places that show one step: 0.1 → 1, 0.01 → 2, 1 → 0. */
const decimals = (step: number) => (step >= 1 ? 0 : Math.ceil(-Math.log10(step)));

function railLabel(p: Param): string {
  const unit = p.unitText ?? UNIT_TEXT[p.unit];
  return `${cap(p.label)}${unit ? ` (${unit})` : ''}`;
}

function bindingOptions(p: Param): BindingParams {
  const label = railLabel(p);
  if (p.kind === 'bool') return { label };
  if (p.kind === 'list')
    return { label, options: Object.fromEntries(p.options.map((o) => [o.text, o.value])) };
  const format = (v: number) => v.toFixed(decimals(p.step));
  return p.kind === 'slider'
    ? { label, min: p.min, max: p.max, step: p.step, format }
    : { label, format };
}

/** The row's tooltip: its source, the default value, the range under `params`, and its bounds. */
function tooltip(p: Param, params: Params): string {
  const lines = [p.source, `Working assumption: ${formatValue(p, p.default)}`];
  return [...lines, ...rangeLine(p, params), ...boundsLine(p)].join('\n');
}

function rangeLine(p: Param, params: Params): string[] {
  const lo = rangeValue(p, 'pess', params);
  const hi = rangeValue(p, 'opt', params);
  if (lo === undefined || hi === undefined) return [];
  return [`Conservative ${formatValue(p, lo)} · upside ${formatValue(p, hi)}`];
}

const boundsLine = (p: Param): string[] =>
  p.kind === 'bool' || p.kind === 'list'
    ? []
    : [`Allowed ${formatValue(p, p.min)}–${formatValue(p, p.max)}`];

type Row = { param: Param; binding: BindingApi<unknown, Value>; tag: HTMLButtonElement };
type ReadoutRow = { api: BindingApi<unknown, string>; cell: { value: string }; spec: Readout };

/** The button after a row's label that opens its source editor. */
function sourceTag(onClick: (tag: HTMLButtonElement) => void): HTMLButtonElement {
  const tag = document.createElement('button');
  tag.type = 'button';
  tag.className = 'prov';
  tag.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick(tag);
  });
  return tag;
}

/** Goal folders take the ladder's step names; empty slots past the ladder hide unless counted. */
function syncGoalFolders(goalFolders: FolderApi[], params: Params) {
  const ladder = LADDERS.get(String(params.ladder)) ?? [];
  goalFolders.forEach((folder, i) => {
    const step = ladder[i];
    folder.title = step ? `Goal ${i + 1} · ${step.label}` : `Goal ${i + 1}`;
    folder.hidden = i >= ladder.length && params[`goal${i}On`] !== true;
  });
}

/** The read-only rows that follow the param `key`. */
function addReadouts(folder: FolderApi, key: string): ReadoutRow[] {
  return READOUTS.flatMap((spec) => {
    if (spec.after !== key) return [];
    const cell = { value: '' };
    const api = folder.addBinding(cell, 'value', {
      label: spec.label,
      readonly: true,
      interval: 0,
    });
    return [{ api, cell, spec }];
  });
}

type Folder = (typeof FOLDERS)[number];

type AddRow = (folder: FolderApi, p: Param) => void;

/** The rows of folder `id` in sub-folder `group` (undefined: not in a sub-folder), in table order. */
const rowsIn = (id: FolderId, group: string | undefined) =>
  PARAMS.filter((p) => p.folder === id && p.group === group);

/** The sub-folder names in folder `id`, in first-use order. */
const groupsIn = (id: FolderId) =>
  new Set(PARAMS.flatMap((p) => (p.folder === id && p.group ? [p.group] : [])));

/** One sub-folder and its rows. */
function addGroup(folder: FolderApi, f: Folder, group: string, addRow: AddRow): FolderApi {
  const sub = folder.addFolder({ title: group, expanded: f.groupsOpen });
  for (const p of rowsIn(f.id, group)) addRow(sub, p);
  return sub;
}

/**
 * One rail folder: its ungrouped rows, a sub-folder per group, then a reset button. Returns the
 * goal sub-folders, whose titles follow the chosen offer.
 */
function addFolder(pane: Pane, f: Folder, addRow: AddRow, onReset: () => void): FolderApi[] {
  const folder = pane.addFolder({ title: f.title, expanded: f.open });
  folder.element.title = f.note;
  for (const p of rowsIn(f.id, undefined)) addRow(folder, p);
  const goalFolders = [...groupsIn(f.id)].flatMap((group) => {
    const sub = addGroup(folder, f, group, addRow);
    return group.startsWith('Goal ') ? [sub] : [];
  });
  const reset = folder.addButton({ title: 'Reset section' });
  reset.element.title = `Reset every input in ${f.title} to Working assumptions`;
  reset.on('click', onReset);
  return goalFolders;
}

export function mountPane(container: HTMLElement, initial: Params, on: PaneHandlers) {
  const pane = new Pane({ container });
  const shadow: Params = { ...initial };
  const rows: Row[] = [];
  const readouts: ReadoutRow[] = [];
  const goalFolders: FolderApi[] = [];
  let applying = false; // true while store values are written back, so they don't echo as edits

  const addRow = (folder: FolderApi, p: Param) => {
    const binding = folder.addBinding(shadow, p.key, bindingOptions(p));
    binding.element.title = tooltip(p, initial);
    binding.on('change', (ev) => {
      if (!applying) on.change(p.key, ev.value);
    });
    const tag = sourceTag((anchor) => on.source(p.key, anchor));
    binding.element.querySelector('.tp-lblv_l')?.append(tag);
    rows.push({ param: p, binding, tag });
    readouts.push(...addReadouts(folder, p.key));
  };

  for (const f of FOLDERS)
    goalFolders.push(...addFolder(pane, f, addRow, () => on.resetFolder(f.id)));
  syncGoalFolders(goalFolders, initial);

  return {
    /** Write store params back into the rail. */
    sync(params: Params) {
      const changed = PARAMS.filter((p) => shadow[p.key] !== params[p.key]);
      if (!changed.length) return;
      for (const p of changed) shadow[p.key] = paramValue(params, p.key);
      applying = true;
      try {
        for (const row of rows) {
          row.binding.refresh();
          row.binding.element.title = tooltip(row.param, params);
        }
      } finally {
        applying = false;
      }
      syncGoalFolders(goalFolders, params);
    },
    setReadouts(o: Outputs) {
      for (const r of readouts) {
        r.cell.value = r.spec.value(o);
        r.api.refresh();
      }
    },
    /** Mark each row with its source marker (see markerFor in sources.ts). */
    setProvenance(
      params: Params,
      provenance: ProvenanceMap,
      markerOf: (key: string, source: ValueSource) => Marker,
    ) {
      for (const { param, tag } of rows) {
        const { source } = provenanceOf(param.key, params, provenance);
        const m = markerOf(param.key, source);
        tag.textContent = m.text;
        tag.dataset.source = source;
        if (m.flag) tag.dataset.flag = m.flag;
        else delete tag.dataset.flag;
        tag.title = m.title;
        tag.setAttribute('aria-label', `Sources for ${cap(param.label)}: ${m.text}`);
      }
    },
  };
}
