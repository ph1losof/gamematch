/**
 * Wires the page, and nothing else. The flow is one way:
 *   param table (params.ts) → stores (store.ts) → toScenario() (adapt.ts) → evaluate() (src/model)
 *   → views (numbers, "Your numbers", scenario picker, charts, rail).
 * Every input change lands in a store; any store change schedules one render per animation frame,
 * and the render reads the stores, evaluates, and redraws every view from the outputs.
 * If evaluate() throws, the page keeps the last good result and lists the error.
 */
import { evaluate } from '../src/model/scenario';
import type { Outputs } from '../src/model/scenario-types';
import { toScenario, variantsFor } from './adapt';
import { mountCharts } from './chart-grid';
import { CITATIONS } from './citations';
import { byId, byIdAs, h } from './dom';
import { renderNoted } from './noted-view';
import { renderNumbers } from './numbers-view';
import { readPalette } from './palette';
import { mountPane } from './pane';
import {
  clampToParam,
  DEFAULTS,
  PARAMS,
  type Params,
  param,
  paramValue,
  type Value,
  withCouplings,
} from './params';
import { createPersister } from './persist';
import { type ProvenanceMap, withoutKeys } from './provenance';
import { mountScenarioPanel, type ViewState } from './scenario-panel';
import { createScenarioStore, WORKING } from './scenarios';
import { linkHash, openingState } from './session';
import { mountSourceEditor } from './source-editor';
import { markerFor, uncited } from './sources';
import { sourcesPanel } from './sources-view';
import { browserStorage, REFUSED_TEXT } from './storage';
import { createStore } from './store';

/** How long "Link copied" shows before the button reads "Copy link" again. */
const COPIED_LABEL_MS = 1500;

// ---------- state ----------
let frame = 0;
/** One render per animation frame, however many stores changed. */
function schedule() {
  if (!frame) frame = requestAnimationFrame(render);
}

let storageRefused = false;
const storage = browserStorage(() => {
  storageRefused = true;
  schedule();
});
const scenarios = createScenarioStore(storage);
const opening = openingState(
  location.hash,
  storage,
  WORKING,
  (id) => scenarios.get(id) !== undefined,
);
const params = createStore<Params>(opening.params);
const sources = createStore<ProvenanceMap>(opening.provenance);
const view = createStore<ViewState>({ active: opening.active, focus: 'android' });
const persist = createPersister(storage);

/** Put `keys` back to their defaults and drop their sources. */
function resetKeys(keys: string[]) {
  sources.replace(withoutKeys(sources.get(), keys));
  params.set(Object.fromEntries(keys.map((k) => [k, paramValue(DEFAULTS, k)])));
}

function resetAll() {
  sources.replace({});
  params.replace({ ...DEFAULTS });
}

// ---------- views ----------
const editor = mountSourceEditor(params, sources, CITATIONS);
const pane = mountPane(byId('pane'), params.get(), {
  change(key: string, value: Value) {
    const v = clampToParam(param(key), value);
    params.set(withCouplings(key, v));
    if (v !== value) pane.sync(params.get());
  },
  resetFolder: (folder) => resetKeys(PARAMS.flatMap((p) => (p.folder === folder ? [p.key] : []))),
  source: (key, anchor) => editor.open(key, anchor),
});
const panel = mountScenarioPanel({ scenarios, params, sources, view });
const charts = mountCharts(byId('charts'), (focus) => view.set({ focus }));

// The Sources panel is static: the citation table doesn't change at run time.
byId('sources-count').textContent =
  `${PARAMS.length - uncited(CITATIONS).length} of ${PARAMS.length} inputs cited, grouped as in the input rail`;
byId('sources-list').replaceChildren(sourcesPanel(CITATIONS));

// ---------- render ----------
let working: Outputs | null = null;
/** Working assumptions' outputs, for the comparison rows (computed once). */
const workingOutputs = () => {
  working ??= evaluate(toScenario(DEFAULTS));
  return working;
};

let lastGood: Outputs | null = null;
type Computed = { o: Outputs; error: string | null };

/** evaluate() for these params, or the last good result plus the error if it throws. */
function compute(p: Params): Computed {
  try {
    lastGood = evaluate(toScenario(p), variantsFor(p));
    return { o: lastGood, error: null };
  } catch (cause) {
    if (!(cause instanceof Error)) throw cause;
    const error = `The model failed on these inputs (${cause.message}); showing the last good result.`;
    return { o: lastGood ?? workingOutputs(), error };
  }
}

function render() {
  frame = 0;
  const p = params.get();
  const provenance = sources.get();
  const { active, focus } = view.get();
  const { o, error } = compute(p);
  renderNumbers(o);
  renderNoted(p, provenance, { edit: editor.open, reset: resetKeys, resetAll });
  panel.render();
  const issues = [error, ...opening.linkIssues, storageRefused ? REFUSED_TEXT : null, ...o.issues];
  byId('issues').replaceChildren(...issues.flatMap((i) => (i ? [h('li', {}, i)] : [])));
  pane.sync(p);
  pane.setReadouts(o);
  pane.setProvenance(p, provenance, (k, source) => markerFor(CITATIONS, k, source));
  charts.render(o, readPalette(), focus);
  persist({ active, params: p, provenance });
}

params.subscribe(schedule);
sources.subscribe(schedule);
view.subscribe(schedule);

// ---------- copy link ----------
const copy = byIdAs('copy', HTMLButtonElement);
copy.addEventListener('click', async () => {
  const state = { active: view.get().active, params: params.get(), provenance: sources.get() };
  const url = `${location.origin}${location.pathname}${linkHash(state)}`;
  try {
    await navigator.clipboard.writeText(url);
  } catch (cause) {
    // A browser may refuse clipboard access (NotAllowedError): show the link to copy by hand.
    if (!(cause instanceof DOMException && cause.name === 'NotAllowedError')) throw cause;
    prompt('Copy this link', url);
    return;
  }
  copy.textContent = 'Link copied';
  setTimeout(() => {
    copy.textContent = 'Copy link';
  }, COPIED_LABEL_MS);
});

render();
