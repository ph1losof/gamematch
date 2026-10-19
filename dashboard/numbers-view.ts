/**
 * The key numbers at the top of the page: the per-platform table and the holdout test figures for
 * the current inputs. The figures themselves come from metrics.ts; this module only lays them out.
 */
import type { Outputs } from '../src/model/scenario-types';
import { byId, h } from './dom';
import {
  COLUMNS,
  type Figure,
  keyNumbers,
  type Row,
  type TestFigure,
  testNumbers,
} from './metrics';
import { PLATFORM_NAME } from './names';

/** The class that colours a signed figure: green above zero, red below, plain otherwise. */
const signClass = (sign: number | undefined) =>
  sign === undefined || sign === 0 ? '' : sign > 0 ? 'pos' : 'neg';

/** "<b>value</b><small>detail</small>". */
const figureCell = (f: Figure) =>
  h(
    'td',
    {},
    h('b', { class: signClass(f.sign) }, f.value),
    ...(f.detail ? [h('small', {}, f.detail)] : []),
  );

const platformRow = (row: Row): HTMLElement =>
  h(
    'tr',
    {},
    h('th', { scope: 'row' }, PLATFORM_NAME[row.platform]),
    ...row.figures.map(figureCell),
  );

function testItem(f: TestFigure): HTMLElement {
  const detail = f.detail ? [h('small', {}, f.detail)] : [];
  return h(
    'div',
    {},
    h('dt', {}, f.label),
    h('dd', {}, h('b', { class: signClass(f.sign) }, f.value), ...detail),
  );
}

/** Render the numbers for the current inputs. */
export function renderNumbers(o: Outputs) {
  const head = h(
    'tr',
    {},
    h('th', {}),
    ...COLUMNS.map((c) => h('th', { scope: 'col' }, c.label, h('small', {}, c.unit))),
  );
  const body = keyNumbers(o).map(platformRow);
  byId('kn').replaceChildren(h('thead', {}, head), h('tbody', {}, ...body));
  byId('test').replaceChildren(...testNumbers(o).map(testItem));
}
