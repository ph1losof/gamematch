/**
 * A param as text: its display name ("Android click-through rate") and a value in its UI unit
 * ("2.5%", "$17", "on"). Used by the rail tooltips, "Your numbers", the source editor, the Sources
 * panel and the tornado's labels.
 */
import { compactNum } from './format';
import { cap } from './names';
import { type Param, param, type Value } from './params';

/** An input's display name: "Win curve steepness". */
export function paramName(key: string): string {
  const p = param(key);
  return cap(p.group ? `${p.group} ${p.label}` : p.label);
}

/** A param value in its UI unit, for the changed list and the tornado. */
export function formatValue(p: Param, v: Value): string {
  if (p.kind === 'bool') return v === true ? 'on' : 'off';
  if (p.kind === 'list') return p.options.find((o) => o.value === v)?.text ?? String(v);
  const x = Number(v);
  switch (p.unit) {
    case '%':
      return `${+x.toFixed(2)}%`;
    case '$':
      return x >= 10_000 ? `$${compactNum(x)}` : `$${Number.isInteger(x) ? x : x.toFixed(2)}`;
    case '×':
      return `${+x.toFixed(2)}×`;
    case 'users':
      return compactNum(x);
    case 'days':
      return `${x} ${x === 1 ? 'day' : 'days'}`;
    case '/day':
      return `${x} a day`;
    default:
      return String(+x.toFixed(3));
  }
}
