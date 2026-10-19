/**
 * Keeps the inputs: after changes, the URL hash and the session are written once the inputs have
 * been still for PERSIST_DELAY_MS, so dragging a slider doesn't write on every frame.
 */

import { linkHash } from './session';
import { STORAGE_KEYS, type TextStore } from './storage';
import { encodeSession, type Session } from './stored-format';

/** How long the inputs must be still before the URL and the session are written. */
const PERSIST_DELAY_MS = 250;

/** Writes the hash and the session after the inputs settle. */
export function createPersister(storage: TextStore) {
  let timer = 0;
  return (s: Session) => {
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      history.replaceState(null, '', linkHash(s) || location.pathname + location.search);
      storage.write(STORAGE_KEYS.session, encodeSession(s));
    }, PERSIST_DELAY_MS);
  };
}
