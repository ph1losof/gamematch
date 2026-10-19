/**
 * "Your numbers": one pill per input that differs from its default or carries a source, showing
 * its value and where it came from. A pill opens the source editor; its × resets that input.
 * "Reset all" puts every input and source back. Nothing is shown while every input is at default.
 */
import { button, byId, h } from './dom';
import { formatValue, paramName } from './param-text';
import { type Params, param, paramValue } from './params';
import { notedKeys, type ProvenanceMap, provenanceOf, SOURCE_LABEL } from './provenance';

export type NotedActions = {
  edit(key: string, anchor: HTMLElement): void;
  reset(keys: string[]): void;
  resetAll(): void;
};

const dateText = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

function pill(
  key: string,
  params: Params,
  provenance: ProvenanceMap,
  on: NotedActions,
): HTMLElement {
  const p = param(key);
  const value = paramValue(params, key);
  const prov = provenanceOf(key, params, provenance);
  const meta = [SOURCE_LABEL[prov.source]];
  if (prov.date) meta.push(dateText(prov.date));
  if (prov.note) meta.push(`“${prov.note}”`);
  const main = h(
    'button',
    { type: 'button', class: 'pill-main', title: 'Edit source' },
    `${paramName(key)}: `,
    h('b', {}, formatValue(p, value)),
    h('span', { class: `meta ${prov.source}` }, ` · ${meta.join(' · ')}`),
  );
  main.addEventListener('click', () => on.edit(key, main));
  const reset = button(
    {
      class: 'pill-x',
      title: 'Reset to default',
      'aria-label': `Reset ${paramName(key)}`,
    },
    '×',
    () => on.reset([key]),
  );
  return h('li', { class: 'pill' }, main, reset);
}

export function renderNoted(params: Params, provenance: ProvenanceMap, on: NotedActions) {
  const keys = notedKeys(params, provenance);
  if (!keys.length) {
    byId('noted').replaceChildren();
    return;
  }
  const head = h(
    'div',
    { class: 'section-head' },
    h('h2', {}, 'Your numbers'),
    button({ class: 'btn', title: 'Reset every input and source' }, 'Reset all', on.resetAll),
  );
  const pills = keys.map((k) => pill(k, params, provenance, on));
  byId('noted').replaceChildren(head, h('ul', { class: 'pills' }, ...pills));
}
