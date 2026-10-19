/**
 * Each hop between parties in plain English: who called whom and why, read from the hop's URL and,
 * for a postback, from what Freecash recorded for it. Pure functions of the hop and a small context
 * the journey fills in, so every sentence can be read next to the facts it is built from.
 */
import type { Outcome } from '../../src/freecash/schema';
import { MEDIA_SOURCE } from '../../src/seed';
import { fmtUsd, type Micros } from '../../src/shared/money';
import type { Platform } from '../../src/shared/types';
import type { Hop, Urls } from '../../src/system';
import { OUTCOME_TEXT, shortId } from './notes';
import type { Party, TimelineEntry } from './types';

export type HopContext = {
  urls: Urls;
  inApp: boolean;
  /** The linked game whose ad SDK asks for the ad. */
  publisher: string;
  /** The matched offer game, once step 1 has found one. */
  offerGame: string | null;
};

/** What Freecash recorded for a postback, read from its database right after the hop. */
export type PostbackFacts = {
  outcome: Outcome;
  advertiser: string;
  conversion: { payout: Micros; reward: Micros } | null;
};

export type HopText = Pick<TimelineEntry, 'party' | 'from' | 'to' | 'text' | 'detail' | 'admin'>;

/** One hop as a party sees it: who sent it and what it is. */
type Said = { from: string; text: string; detail?: string; admin?: boolean };

const NAMES = {
  adnet: 'Ad network',
  fcmmp: 'Freecash MMP',
  freecash: 'Freecash',
  advmmp: 'Advertiser MMP',
  store: 'Store',
  ops: 'Operator',
  phone: 'Phone',
};

/** The back-office calls the operator makes to Freecash, by path. */
const ADMIN_TEXT = new Map([
  ['/admin/experiment/enroll', 'enroll eligible linked users, frozen into treatment / control'],
  ['/admin/campaigns', 'launch a campaign (offer × platform × segment)'],
  ['/admin/audiences/refresh', 'refresh audiences: one best-fit offer per user'],
  ['/admin/spend/sync', "sync ad spend from the network's report"],
  ['/admin/rewards/release', 'release rewards whose hold has passed'],
]);

/** A call Freecash's back office makes, hidden when the page hides back-office calls. */
const backOffice = (text: string): Said => ({ from: NAMES.freecash, text, admin: true });

/** Which party a host belongs to. Anything outside the System is the store. */
function partyOf(host: string, urls: Urls): Party {
  if (host === new URL(urls.adNetwork).host) return 'adnet';
  if (host === new URL(urls.freecashMmp).host) return 'fcmmp';
  if (host === new URL(urls.freecash).host) return 'freecash';
  if (host === new URL(urls.mmp).host) return 'advmmp';
  return 'store';
}

/** One hop in words. `postback` is set when the hop is a postback Freecash recorded. */
export function describeHop(
  hop: Pick<Hop, 'method' | 'url'>,
  ctx: HopContext,
  postback: PostbackFacts | null,
): HopText {
  const url = new URL(hop.url);
  const party = partyOf(url.host, ctx.urls);
  const said = saidTo(party, url, ctx, postback) ?? {
    from: NAMES.phone,
    text: `${hop.method} ${url.pathname}`,
  };
  return {
    party,
    from: said.from,
    to: NAMES[party],
    text: said.text,
    detail: said.detail ?? null,
    admin: said.admin ?? false,
  };
}

function saidTo(party: Party, url: URL, ctx: HopContext, postback: PostbackFacts | null) {
  switch (party) {
    case 'adnet':
      return toAdNetwork(url, ctx);
    case 'fcmmp':
      return toFreecashMmp(url);
    case 'freecash':
      return postback ? postbackSaid(url, postback) : toFreecash(url, ctx);
    case 'advmmp':
      return toAdvertiserMmp(url, ctx);
    default:
      return null;
  }
}

function toAdNetwork(url: URL, ctx: HopContext): Said | null {
  const path = url.pathname;
  if (path === '/v1/audiences') return backOffice('upload campaign audience (device IDs)');
  if (path.startsWith('/v1/audiences/'))
    return backOffice('replace audience: each user kept in their best-fit offer only');
  if (path === '/v1/campaigns')
    return backOffice('create campaign: audience, bid, creative, click URL');
  if (path.endsWith('/report')) return backOffice("pull the campaign's spend report");
  if (path === '/v1/postbacks')
    return {
      from: NAMES.fcmmp,
      text: `conversion postback (${url.searchParams.get('event')}) for the network to optimise on`,
    };
  if (path === '/sim/serve')
    return { from: ctx.publisher, text: "ad request from the game's ad SDK; first-price auction" };
  if (path === '/sim/click')
    return { from: NAMES.phone, text: 'ad tapped; the network fills the click URL macros' };
  return null;
}

function toFreecashMmp(url: URL): Said | null {
  if (url.pathname.startsWith('/click/'))
    return {
      from: NAMES.phone,
      text: 're-engagement click recorded; deep link on to Freecash',
    };
  if (url.pathname === '/s2s/event')
    return {
      from: NAMES.freecash,
      text: "offer_started (server to server): credits the ad network's click",
    };
  return null;
}

/** Freecash pages the phone opens, by the path's first segment ("go" and "/l/:id/start" depend on more). */
const PAGE_TEXT = new Map([
  ['l', 'landing page'],
  ['s', '"Opening the store…" page, then on to the tracking link'],
  ['p', 'progress page'],
]);

function toFreecash(url: URL, ctx: HopContext): Said | null {
  const [first = '', , third] = url.pathname.split('/').slice(1);
  if (first === 'admin') return adminCall(url.pathname);
  const text = pageText(first, third, ctx.inApp);
  return text ? { from: ctx.inApp ? 'Freecash app' : 'Phone browser', text } : null;
}

function pageText(first: string, third: string | undefined, inApp: boolean) {
  if (first === 'go')
    return `ad click recorded; user identified by ${inApp ? 'the app session' : 'the ad ID in the URL'}`;
  if (first === 'l' && third === 'start') return 'Start tapped: click ID minted, offer start saved';
  return PAGE_TEXT.get(first);
}

/** The operator's call to Freecash's back office; any other admin path is a campaign report. */
const adminCall = (path: string): Said => ({
  from: NAMES.ops,
  text: ADMIN_TEXT.get(path) ?? 'campaign report (funnel, spend, network conversions)',
  admin: true,
});

/** A postback to Freecash: the event, and what Freecash did with it. */
function postbackSaid(url: URL, facts: PostbackFacts): Said {
  const paid = facts.conversion;
  return {
    from: NAMES.advmmp,
    text: `${url.searchParams.get('event')} postback (${facts.outcome})`,
    detail: paid
      ? `bill ${facts.advertiser} ${fmtUsd(paid.payout)} · reward ${fmtUsd(paid.reward)} on hold · one ledger transaction`
      : OUTCOME_TEXT[facts.outcome],
  };
}

function toAdvertiserMmp(url: URL, ctx: HopContext): Said | null {
  const path = url.pathname;
  const sdk = `${ctx.offerGame ?? 'Game'} SDK`;
  if (path.startsWith('/click/')) return { from: NAMES.phone, text: clickText(url) };
  if (path === '/sdk/install')
    return { from: sdk, text: 'first open: the MMP decides who gets the install' };
  if (path === '/sdk/event') return { from: sdk, text: 'in-app event' };
  if (path === '/apps') return { from: NAMES.ops, text: 'register app and partners', admin: true };
  return null;
}

/** A click on the advertiser's tracking link: ours, or a competitor's. */
function clickText(url: URL) {
  const pid = url.searchParams.get('pid');
  return pid === MEDIA_SOURCE
    ? `click recorded with our click ID (${MEDIA_SOURCE}); redirect to the store`
    : `a competitor's click recorded (pid=${pid}); redirect to the store`;
}

/** The phone's visit to the store. The store is outside the System, so no hop reports it. */
export function storeVisit(
  url: string,
  platform: Platform,
): Omit<TimelineEntry, 'seq' | 'group' | 'at'> {
  const referrer = new URL(url).searchParams.get('referrer');
  return {
    depth: 0,
    method: 'GET',
    url,
    status: null,
    location: null,
    party: 'store',
    from: NAMES.phone,
    to: platform === 'android' ? 'Play Store' : 'App Store',
    text: 'store page opens (outside our network)',
    detail: referrer
      ? `install referrer = ${shortId(referrer)} (the MMP's click)`
      : 'no install referrer on iOS',
    admin: false,
  };
}
