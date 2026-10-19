/**
 * localStorage as plain text (what goes in is stored-format.ts's text, so nothing here parses).
 * A browser can refuse storage: SecurityError when site data is blocked, QuotaExceededError when it
 * is full or in some private windows. Then the page keeps working, forgets on reload, and says so
 * once through `onRefused`. Any other error is a bug and propagates.
 */
export type TextStore = {
  read(key: string): string | null;
  write(key: string, text: string): void;
};

export const STORAGE_KEYS = { session: 'gamematch.session', saved: 'gamematch.scenarios' } as const;

const REFUSALS = ['SecurityError', 'QuotaExceededError'];

const isRefusal = (cause: unknown): cause is DOMException =>
  cause instanceof DOMException && REFUSALS.includes(cause.name);

export const REFUSED_TEXT =
  'This browser refused to save (blocked or full storage): scenarios and the session last only until reload.';

/** localStorage, reporting a refusal by name instead of failing the page. */
export function browserStorage(onRefused: (cause: DOMException) => void): TextStore {
  return {
    read(key) {
      try {
        return localStorage.getItem(key);
      } catch (cause) {
        if (!isRefusal(cause)) throw cause;
        onRefused(cause);
        return null;
      }
    },
    write(key, text) {
      try {
        localStorage.setItem(key, text);
      } catch (cause) {
        if (!isRefusal(cause)) throw cause;
        onRefused(cause);
      }
    },
  };
}
