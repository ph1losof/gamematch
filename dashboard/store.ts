/**
 * A tiny store: one value and the listeners to tell when it changes. The page keeps three: the
 * params, their provenance, and the view (active scenario, chart platform). Recovery is by reset
 * (per input, per folder, all) and scenarios, so there is no history.
 */
type Listener<T> = (value: T) => void;

export function createStore<T extends object>(initial: T) {
  let value = { ...initial };
  const listeners = new Set<Listener<T>>();
  const emit = () => {
    for (const l of listeners) l(value);
  };
  return {
    get: () => value,
    subscribe(l: Listener<T>) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    /** Merge changes. */
    set(changes: Partial<T>) {
      value = { ...value, ...changes };
      emit();
    },
    /** Replace everything (scenario load, reset all). */
    replace(next: T) {
      value = { ...next };
      emit();
    },
  };
}

export type Store<T extends object> = ReturnType<typeof createStore<T>>;
