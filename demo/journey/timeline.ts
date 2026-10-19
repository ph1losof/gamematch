/**
 * The hop timeline: every request the journey's actors (the phone, a game SDK, the operator) make,
 * and the server-to-server calls each one causes, in causal order and at their real depth. The
 * System reports hops through `onHop` as their responses finish, innermost first; each carries a
 * `seq` from when it started, so sorting by it puts every caller before the calls it made.
 */
import type { Clock } from '../../src/shared/clock';
import type { Hop } from '../../src/system';
import type { HopText } from './hops';
import type { TimelineEntry } from './types';

/** An HTML page an actor rendered, kept so a step can show one it passed through. */
export type Page = { url: string; html: string };

export class Timeline {
  readonly entries: TimelineEntry[] = [];
  /** The demo action new hops belong to, e.g. "2 · Tap the ad". */
  group = 'Setup';
  private pending: Hop[] = [];
  private silent = 0;
  private seq = 0;

  constructor(
    private readonly describe: (hop: Hop) => HopText,
    private readonly clock: Clock,
  ) {}

  /** For createInProcessSystem: collects hops until the actor's request returns. */
  readonly onHop = (hop: Hop) => {
    if (this.silent === 0) this.pending.push(hop);
  };

  /**
   * A `fetch` for one actor. After each request it moves the hops it caused into the timeline;
   * `onPage` also gets every HTML page the actor rendered.
   */
  fetchFor(fetch: typeof globalThis.fetch, onPage?: (page: Page) => void): typeof globalThis.fetch {
    const fn = async (input: string | URL | Request, init?: RequestInit) => {
      const mark = this.pending.length;
      const res = await fetch(input, init);
      for (const hop of this.pending.splice(mark).sort((a, b) => a.seq - b.seq)) {
        const { method, url, status, location, depth } = hop;
        this.push({ method, url, status, location, depth, ...this.describe(hop) });
      }
      if (onPage && isHtmlPage(res)) onPage({ url: urlOf(input), html: await res.clone().text() });
      return res;
    };
    // `fetch` also carries `preconnect`, which the demo has no use for: keep the real one.
    return Object.assign(fn, { preconnect: fetch.preconnect });
  }

  /** Adds an entry the System didn't report, like the visit to the store outside it. */
  push(entry: Omit<TimelineEntry, 'seq' | 'group' | 'at'>) {
    this.seq += 1;
    this.entries.push({ seq: this.seq, group: this.group, at: this.clock.now(), ...entry });
  }

  /** Adds to the detail line of the latest top-level hop. */
  annotate(detail: string) {
    const top = this.entries.findLast((e) => e.depth === 0);
    if (top) top.detail = top.detail ? `${top.detail} · ${detail}` : detail;
  }

  /** Runs `fn` without recording its hops (seeding, reading the panels). */
  async quietly<T>(fn: () => Promise<T>): Promise<T> {
    this.silent += 1;
    try {
      return await fn();
    } finally {
      this.silent -= 1;
    }
  }
}

const urlOf = (input: string | URL | Request) =>
  input instanceof Request ? input.url : input.toString();

const isHtmlPage = (res: Response) =>
  res.status === 200 && (res.headers.get('content-type') ?? '').includes('text/html');
