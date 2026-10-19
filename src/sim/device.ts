/**
 * A simulated phone: it reports its ad ID to apps and follows links like a browser would. If the
 * Freecash app is installed and logged in, Freecash's universal links open in the app, which sends
 * the user's session along (`x-user-id` stands in for it); otherwise they open in the browser.
 */

import { ZERO_AD_ID } from '../shared/adid';
import type { Platform } from '../shared/types';

type Visit = { url: string; status: number; html: string; external: boolean };

/** Hops one `open` follows before giving up; our flow needs at most five. Our design choice. */
const MAX_HOPS = 10;

/** Where a response sends the browser on: a 3xx Location, or a page's meta refresh. */
function forwardOf(res: Response, html: string): string | null {
  const location = res.headers.get('location');
  if (res.status >= 300 && res.status < 400 && location) return location;
  // Pages like "Opening the App Store…" move on by themselves after a moment.
  const refresh = html.match(/<meta http-equiv="refresh" content="\d+;\s*url=([^"]+)"/i)?.[1];
  return refresh ? refresh.replaceAll('&amp;', '&') : null;
}

export class Device {
  readonly platform: Platform;
  readonly adId: string;
  private readonly optedOut: boolean;
  private readonly att: Set<string>;
  private readonly freecashApp?: { host: string; userId: string };

  constructor(
    private readonly net: { fetch: typeof fetch; isInternal(url: string): boolean },
    opts: {
      platform: Platform;
      adId?: string;
      optedOut?: boolean;
      att?: string[];
      freecashApp?: { host: string; userId: string };
    },
  ) {
    this.platform = opts.platform;
    this.adId = opts.adId ?? crypto.randomUUID();
    this.optedOut = opts.optedOut ?? false;
    this.att = new Set(opts.att ?? []);
    this.freecashApp = opts.freecashApp;
  }

  /** What an app reads as the ad ID. Android: one GAID unless opted out. iOS: zeros unless ATT was allowed in that app. */
  adIdFor(appId: string) {
    if (this.platform === 'android') return this.optedOut ? ZERO_AD_ID : this.adId;
    return this.att.has(appId) ? this.adId : ZERO_AD_ID;
  }

  /** Opens a URL and follows redirects until a page renders or the link leaves our network (e.g. to the app store). */
  async open(url: string, init?: RequestInit): Promise<Visit> {
    for (let hops = 0; hops < MAX_HOPS; hops++) {
      if (!this.net.isInternal(url)) return { url, status: 0, html: '', external: true };
      const headers = this.headersFor(url, init);
      const res = await this.net.fetch(url, { ...init, headers, redirect: 'manual' });
      const html = await res.text();
      const forward = forwardOf(res, html);
      if (!forward) return { url, status: res.status, html, external: false };
      url = new URL(forward, url).href;
      init = undefined; // 302/303 and refreshes become a GET
    }
    throw new Error('too many redirects');
  }

  /** In the Freecash app, Freecash's own links carry the logged-in session. */
  private headersFor(url: string, init?: RequestInit) {
    const headers = new Headers(init?.headers);
    const app = this.freecashApp;
    if (app && new URL(url).host === app.host) headers.set('x-user-id', app.userId);
    return headers;
  }
}
