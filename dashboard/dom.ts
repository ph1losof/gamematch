/**
 * The two DOM helpers every view uses: find a page element by id, and build an element from a tag,
 * attributes and children. Nothing else in dashboard/ creates elements by hand.
 */

/** The page element with this id, which index.html declares. A missing one is a broken page, so it throws. */
export function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`index.html has no #${id}`);
  return el;
}

/** The page element with this id, checked to be of `type` (an <input>, a <select>…). */
export function byIdAs<T extends HTMLElement>(id: string, type: new () => T): T {
  const el = byId(id);
  if (!(el instanceof type)) throw new Error(`#${id} is not a ${type.name}`);
  return el;
}

export type Attrs = Record<string, string>;

/** `<tag attrs…>children…</tag>`. */
export function h(tag: string, attrs: Attrs = {}, ...children: (Node | string)[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.append(...children);
  return el;
}

/** A <button type="button"> that runs `onClick`. */
export function button(attrs: Attrs, label: string, onClick: () => void): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.append(label);
  el.addEventListener('click', onClick);
  return el;
}
