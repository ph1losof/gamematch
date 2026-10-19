/** Time units in milliseconds, and the clock every rule reads, so tests can move time instead of waiting. */
export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;

/** Every time-dependent rule (attribution windows, goal deadlines) reads time from here, so tests can move it. */
export interface Clock {
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };

export class ManualClock implements Clock {
  constructor(private t = Date.UTC(2026, 9, 1)) {}
  now() {
    return this.t;
  }
  advance(ms: number) {
    this.t += ms;
  }
}
