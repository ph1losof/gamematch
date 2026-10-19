/**
 * Which inputs the page opens with: a link's hash wins, then the last session, then Working
 * assumptions. persist.ts writes both back.
 */
import { decodeLink, encodeLink } from './link-format';
import { DEFAULTS } from './params';
import { STORAGE_KEYS, type TextStore } from './storage';
import { decodeSession, type Session } from './stored-format';

export type Opening = Session & { linkIssues: string[] };

/** The opening state; `exists` says whether a stored active scenario id still exists. */
export function openingState(
  hash: string,
  storage: TextStore,
  working: string,
  exists: (id: string) => boolean,
): Opening {
  if (hash.length > 1) return fromLink(hash, working);
  const last = decodeSession(storage.read(STORAGE_KEYS.session) ?? '');
  const fresh = { active: working, params: { ...DEFAULTS }, provenance: {} };
  const opened = last && exists(last.active) ? last : fresh;
  return { ...opened, linkIssues: [] };
}

/** A link opens on Working assumptions' slot, edited by the link's values; bad entries are listed. */
function fromLink(hash: string, working: string): Opening {
  const { params, provenance, rejected } = decodeLink(hash);
  const linkIssues = rejected.length
    ? [`Ignored values from the link that aren't valid: ${rejected.join(', ')}.`]
    : [];
  return { active: working, params, provenance, linkIssues };
}

/** "#us=40&cpmA=18…" for the current inputs, or "" at Working assumptions. */
export function linkHash(s: Session): string {
  const hash = encodeLink(s.params, s.provenance);
  return hash ? `#${hash}` : '';
}
