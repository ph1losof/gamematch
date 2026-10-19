/**
 * Wires Freecash and the mocks together. The same wiring runs on real ports (src/main.ts) or
 * in-process (tests, demo), where requests are routed by hostname without opening sockets.
 * Two MMP instances run: the advertiser's (credits Game B installs, posts back to Freecash) and
 * Freecash's own (credits re-engagement of the Freecash app, posts back to the ad network).
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { createFreecash } from './freecash/app';
import { type Config, defaultConfig } from './freecash/config';
import { openDb } from './freecash/db';
import { createAdNetwork, mockAdNetworkClient } from './mocks/adnetwork';
import { createMmp, mockAttributionClient } from './mocks/mmp';
import { type Clock, systemClock } from './shared/clock';

export type Urls = { freecash: string; adNetwork: string; mmp: string; freecashMmp: string };

export function createSystem(opts: {
  urls: Urls;
  fetch: typeof fetch;
  clock?: Clock;
  config?: Partial<Config>;
}) {
  const clock = opts.clock ?? systemClock;
  const config: Config = {
    ...defaultConfig(opts.urls.freecash),
    ...opts.config,
  };
  const deps = {
    db: openDb(),
    clock,
    config,
    adNetwork: mockAdNetworkClient(opts.urls.adNetwork, opts.fetch),
    attribution: mockAttributionClient(opts.urls.freecashMmp, opts.fetch),
  };
  return {
    ...deps,
    urls: opts.urls,
    fetch: opts.fetch,
    freecash: createFreecash(deps),
    adNetworkMock: createAdNetwork({ clock }),
    mmpMock: createMmp({ clock, fetch: opts.fetch }),
    freecashMmpMock: createMmp({ clock, fetch: opts.fetch }),
  };
}

export type System = ReturnType<typeof createSystem> & { isInternal(url: string): boolean };

/**
 * One request between parties, for demos that show the flow hop by hop. Hops are reported when
 * their response is ready, so a nested call arrives before the request that caused it: `seq`
 * (numbered when the request starts) restores causal order, and `depth` says how deep it was
 * nested (0 for a request from outside the System, 1 for a call its handler made, and so on).
 */
export type Hop = {
  method: string;
  url: string;
  status: number;
  location: string | null;
  depth: number;
  seq: number;
};

export function createInProcessSystem(
  opts: { clock?: Clock; config?: Partial<Config>; onHop?: (hop: Hop) => void } = {},
): System {
  const urls = {
    freecash: 'http://freecash.test',
    adNetwork: 'http://ads.test',
    mmp: 'http://mmp.test',
    freecashMmp: 'http://freecash-mmp.test',
  };
  const routes: Record<string, (req: Request) => Promise<Response>> = {};
  const sys = createSystem({ ...opts, urls, fetch: inProcessFetch(routes, opts.onHop) });
  routes['freecash.test'] = (r) => sys.freecash.handle(r);
  routes['ads.test'] = (r) => sys.adNetworkMock.handle(r);
  routes['mmp.test'] = (r) => sys.mmpMock.handle(r);
  routes['freecash-mmp.test'] = (r) => sys.freecashMmpMock.handle(r);
  return { ...sys, isInternal: (url) => new URL(url).host in routes };
}

/**
 * A `fetch` that hands each request to the in-process app registered for its hostname. The handler
 * runs with its depth in AsyncLocalStorage, so any request it makes in turn knows it is one deeper.
 */
function inProcessFetch(
  hosts: Record<string, (req: Request) => Promise<Response>>,
  onHop?: (hop: Hop) => void,
): typeof fetch {
  const nesting = new AsyncLocalStorage<number>();
  let seq = 0;
  const fn = async (input: string | URL | Request, init?: RequestInit) => {
    const req = input instanceof Request ? input : new Request(input.toString(), init);
    const handler = hosts[new URL(req.url).host];
    if (!handler) throw new Error(`no route to ${req.url}`);
    const depth = nesting.getStore() ?? 0;
    const hop = { method: req.method, url: req.url, depth, seq: ++seq };
    const res = await nesting.run(depth + 1, () => handler(req));
    onHop?.({ ...hop, status: res.status, location: res.headers.get('location') });
    return res;
  };
  // `fetch` also carries `preconnect`, which in-process routing has no use for: keep the real one.
  return Object.assign(fn, { preconnect: fetch.preconnect });
}
