/**
 * The citation views: the block shown in an input's source popover, and the Sources panel grouped
 * by rail folder. Links open in a new tab with rel=noopener; only http(s) URLs become links.
 */
import type { Citation, Citations, Publication } from './citations';
import { h } from './dom';
import { paramName } from './param-text';
import { FOLDERS, PARAMS } from './params';
import { BASIS_LABEL, JUDGEMENT, passage, sourceLine } from './sources';

/** In the popover, sources past this many fold under "N more sources". */
const COMPACT = 3;

const isWebLink = (url: string) => /^https?:\/\//i.test(url);

/** "Publisher — Title (date)", as a link when the URL is a web link. */
const sourceTitle = (s: Publication): Node =>
  isWebLink(s.url)
    ? h('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer' }, sourceLine(s))
    : document.createTextNode(sourceLine(s));

/** A verified passage is quoted; a paraphrase is shown as plain text, never in quotation marks. */
function sourcePassage(s: Publication): Node[] {
  if (!s.supports) return [];
  if (s.status === 'paraphrased')
    return [h('span', { class: 'para' }, `Paraphrased: ${passage(s)}`)];
  return [h('q', {}, passage(s))];
}

function sourceItem(s: Publication): HTMLElement {
  const unreachable =
    s.status === 'unreachable'
      ? [h('span', { class: 'status' }, ` (link unreachable on ${s.checked})`)]
      : [];
  return h('li', {}, sourceTitle(s), ...unreachable, ...sourcePassage(s));
}

/** The numbered source list; `compact` folds all but the first COMPACT into a details element. */
function sourceList(sources: Publication[], compact: boolean): HTMLElement {
  const items = sources.map(sourceItem);
  const shown = compact && items.length > COMPACT + 1 ? COMPACT : items.length;
  const list = h('ol', { class: 'cite-sources' }, ...items.slice(0, shown));
  if (shown < items.length) {
    const rest = h(
      'ol',
      { class: 'cite-sources', start: String(shown + 1) },
      ...items.slice(shown),
    );
    const summary = h('summary', {}, `${items.length - shown} more sources`);
    list.append(
      h('li', { class: 'cite-more-li' }, h('details', { class: 'cite-more' }, summary, rest)),
    );
  }
  return list;
}

function basisLine(c: Citation): HTMLElement {
  const flagged = JUDGEMENT[c.basis] !== undefined;
  return h('p', { class: flagged ? 'cite-basis flag' : 'cite-basis' }, BASIS_LABEL[c.basis]);
}

/** One citation: basis, note and sources. */
function citationView(c: Citation, compact: boolean): HTMLElement {
  const note = c.note ? [h('p', { class: 'cite-note' }, c.note)] : [];
  const list = c.sources.length ? [sourceList(c.sources, compact)] : [];
  return h('div', { class: 'cite' }, basisLine(c), ...note, ...list);
}

/** The citation block for one input (the source popover shows it `compact`). */
export function citationBlock(citations: Citations, key: string, compact = false): HTMLElement {
  const c = citations[key];
  return c
    ? citationView(c, compact)
    : h('div', { class: 'cite' }, h('p', { class: 'cite-basis' }, 'No citation recorded yet'));
}

type CitedGroup = { citation: Citation; keys: string[] };

/** Keys grouped by identical citation (Android and iOS of one figure share a row). */
function citedGroups(citations: Citations, keys: string[]): CitedGroup[] {
  const groups = new Map<string, CitedGroup>();
  for (const k of keys) {
    const citation = citations[k];
    if (!citation) continue;
    const id = JSON.stringify(citation);
    const group = groups.get(id);
    if (group) group.keys.push(k);
    else groups.set(id, { citation, keys: [k] });
  }
  return [...groups.values()];
}

function folderSection(citations: Citations, title: string, keys: string[]): HTMLElement {
  const rows = citedGroups(citations, keys).map((group) =>
    h(
      'div',
      { class: 'src-row' },
      h('p', { class: 'src-name' }, group.keys.map(paramName).join(' · ')),
      citationView(group.citation, false),
    ),
  );
  const missing = keys.filter((k) => !citations[k]);
  const uncited = missing.length
    ? [
        h(
          'p',
          { class: 'src-uncited' },
          `No citation recorded yet: ${missing.map(paramName).join(', ')}.`,
        ),
      ]
    : [];
  return h('section', { class: 'src-folder' }, h('h3', {}, title), ...rows, ...uncited);
}

/** Every cited input, grouped by rail folder; inputs with none are listed by name at the end. */
export function sourcesPanel(citations: Citations): HTMLElement {
  const sections = FOLDERS.flatMap((f) => {
    const keys = PARAMS.flatMap((p) => (p.folder === f.id ? [p.key] : []));
    return keys.length ? [folderSection(citations, f.title, keys)] : [];
  });
  return h('div', { class: 'src-list' }, ...sections);
}
