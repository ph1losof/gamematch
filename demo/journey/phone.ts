/**
 * The phone on the page: one HTML builder per Screen kind, its caption, and the iframe that shows
 * Freecash's real pages. Builders are pure (screen in, HTML out); app.ts decides when to show what.
 * `data-act="n"` marks what runs step n when tapped; app.ts highlights the next one.
 */
import { esc } from '../../src/freecash/html';
import { shortIds } from './format';
import type { Screen } from './types';

/** What every screen may need besides itself. */
export type PhoneContext = { inApp: boolean; linkedGame: string };

type ScreenOf<K extends Screen['kind']> = Extract<Screen, { kind: K }>;

/** Each offer game's icon colours; any other game gets the default pair. */
const GAME_COLORS = new Map([
  ['Castle Siege', ['#f97316', '#9f1239']],
  ['Bubble Saga', ['#ec4899', '#0891b2']],
]);
const colors = (game: string) => {
  const [g1, g2] = GAME_COLORS.get(game) ?? ['#6366f1', '#0ea5e9'];
  return `--g1:${g1};--g2:${g2}`;
};
const monogram = (game: string) =>
  game
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2);
const icon = (game: string) => `<span class="mono-ic">${esc(monogram(game))}</span>`;

export function caption(s: Screen, ctx: PhoneContext) {
  switch (s.kind) {
    case 'home':
      return `Alex's phone. ${ctx.linkedGame} is linked to their Freecash account.`;
    case 'game-ad':
      return `${ctx.linkedGame} shows an interstitial from the ad network: our ${s.segment}-segment creative for ${s.offerGame}.`;
    case 'game-noad':
      return 'The ad request went out; nothing in the auction matched this device.';
    case 'other-ad':
      return `Another app, another network: ${s.network}'s ad for ${s.offerGame}.`;
    case 'web':
      return `Real Freecash HTML (${shortIds(new URL(s.url).pathname)}), ${s.inApp ? 'opened in the Freecash app' : 'opened in the browser'}.`;
    case 'store':
      return `Mock ${s.platform === 'android' ? 'Play Store' : 'App Store'} page, reached through ${s.developer}'s MMP tracking link.`;
    case 'game':
      return `${s.game} running on Alex's phone; its MMP SDK reports to the advertiser's MMP.`;
  }
}

export function screenHtml(s: Screen, ctx: PhoneContext): string {
  switch (s.kind) {
    case 'home':
      return homeHtml(ctx);
    case 'game-ad':
      return linkedGameScene(ctx.linkedGame, ourAdHtml(s));
    case 'game-noad':
      return linkedGameScene(
        ctx.linkedGame,
        `<div class="kc-toast"><b>Victory!</b>Break between levels. The ad slot stayed empty: the network had nothing for this device.</div>`,
      );
    case 'other-ad':
      return otherAdHtml(s);
    case 'web':
      return webHtml(s);
    case 'store':
      return s.platform === 'android' ? playStore(s) : appStore(s);
    case 'game':
      return offerGameHtml(s);
  }
}

/** The home screen's apps: name, icon letter, icon background. */
const HOME_APPS: [string, string, string][] = [
  ['Messages', 'M', 'linear-gradient(135deg,#34d399,#059669)'],
  ['Camera', 'C', 'linear-gradient(135deg,#6b7280,#374151)'],
  ['Photos', 'P', 'linear-gradient(135deg,#f59e0b,#ef4444)'],
  ['Maps', 'Mp', 'linear-gradient(135deg,#60a5fa,#22c55e)'],
  ['Music', '♪', 'linear-gradient(135deg,#f43f5e,#be123c)'],
  ['Settings', 'S', 'linear-gradient(135deg,#9ca3af,#4b5563)'],
];

function homeHtml(ctx: PhoneContext) {
  const app = (name: string, letter: string, bg: string, act = '') =>
    `<button class="app" ${act}><span class="ic" style="background:${bg}">${esc(letter)}</span>${esc(name)}</button>`;
  const linked = app(
    ctx.linkedGame,
    monogram(ctx.linkedGame),
    'linear-gradient(135deg,#1e3a8a,#7c3aed)',
    'data-act="1"',
  );
  const freecash = ctx.inApp ? app('Freecash', 'F', 'linear-gradient(135deg,#22c55e,#15803d)') : '';
  const others = HOME_APPS.map(([name, letter, bg]) => app(name, letter, bg));
  const hint = ctx.inApp
    ? 'Freecash app installed and logged in.'
    : 'No Freecash app: links open in the browser.';
  return `<div class="home"><div class="apps">${linked}${freecash}${others.join('')}</div><p class="home-hint">${hint}</p></div>`;
}

/** The linked game's screen (one shared castle scene), with an ad or a message on top. */
function linkedGameScene(name: string, overlay: string) {
  return `<div class="kc"><div class="kc-hud"><span class="kc-title">${esc(name)}</span><span class="kc-res"><i class="coin"></i>12,450</span><span class="kc-res"><i class="gem"></i>320</span></div>
    <div class="kc-scene"><svg viewBox="0 0 200 110" aria-hidden="true">
      <path d="M0 110V70h14v-8h6v8h6v-8h6v8h14V40h-4v-8h6v6h6v-6h6v6h6v-6h6v8h-4v30h12V22h-4v-8h6v6h6v-6h6v6h6v-6h6v8h-4v48h12V40h-4v-8h6v6h6v-6h6v6h6v-6h6v8h-4v30h14v-8h6v8h6v-8h6v8h14v40z"/>
      <path class="flag" d="M100 14V2l14 5-14 5z"/></svg></div>
    <div class="kc-bar"><span>Battle</span><span>Build</span><span>Army</span></div>${overlay}</div>`;
}

/** An interstitial ad: the advertiser's mark and name with the Ad tag and close ×, then the body. */
function adCard(brand: string, mark: string, body: string) {
  return `<div class="ad-overlay"><div class="ad-card">
    <div class="ad-top"><span class="ad-mark">${esc(mark)}</span><b>${esc(brand)}</b><span class="ad-badge">Ad</span><span class="x">×</span></div>
    <div class="ad-body">${body}</div></div></div>`;
}

function ourAdHtml(s: ScreenOf<'game-ad'>) {
  return adCard(
    'Freecash',
    'F',
    `<small>${esc(s.offerGame)} · ${esc(s.genre)}</small><h3>${esc(s.creative.headline)}</h3><p>${esc(s.creative.body)}</p>
      <button class="cta" data-act="2">${esc(s.creative.cta)}</button>`,
  );
}

function otherAdHtml(s: ScreenOf<'other-ad'>) {
  const card = adCard(
    s.network,
    monogram(s.network),
    `<small>${esc(s.offerGame)} · Free · ${esc(s.genre)}</small><h3>Play ${esc(s.offerGame)} today</h3><p>Install now, free.</p><button class="cta">Install</button>`,
  );
  return `<div class="pb"><div class="kc-hud"><span class="kc-title">${esc(s.publisher)}</span><span class="kc-res">Level 88</span></div>${card}</div>`;
}

/** A Freecash page: in the app's own chrome, or the browser's address bar. app.ts fills the iframe. */
function webHtml(s: ScreenOf<'web'>) {
  const u = new URL(s.url);
  const chrome = s.inApp
    ? `<div class="chrome app"><span class="fc-mark">F</span>Freecash<small>${esc(s.title)}</small></div>`
    : `<div class="chrome"><div class="urlbar"><span class="lock"></span><span>${esc(u.host)}${esc(shortIds(u.pathname))}</span></div></div>`;
  return `${chrome}<iframe class="webview" title="${esc(s.title)}"></iframe>`;
}

/** The offer game on the phone: a notification if we paid, and on first open the ATT prompt (iOS). */
function offerGameHtml(s: ScreenOf<'game'>) {
  const n = s.notification;
  const notification = n
    ? `<div class="notif"><span class="fc-mark">F</span><div><div class="notif-app">Freecash<span>now</span></div><p>${esc(n.title)}</p><small>${esc(n.body)}</small></div></div>`
    : '';
  const att = s.att
    ? `<div class="att"><p><b>Allow “${esc(s.game)}” to track your activity across other companies' apps and websites?</b>Alex's choice decides whether the MMP can see the IDFA.</p><div class="choice ${s.att === 'denied' ? 'chosen' : ''}">Ask App Not to Track</div><div class="choice ${s.att === 'allowed' ? 'chosen' : ''}">Allow</div></div>`
    : '';
  return `<div class="og">${notification}
    <h3>${esc(s.title)}</h3><p>${esc(s.sub)}</p><div class="bar"><i></i></div>${att}</div>`;
}

function playStore(s: ScreenOf<'store'>) {
  return `<div class="store" style="${colors(s.game)}">
    <div class="play-top"><span class="play-logo"></span><span class="search">Search apps &amp; games</span></div>
    <div class="app-head">${icon(s.game)}<div><h2>${esc(s.game)}</h2><span class="dev">${esc(s.developer)}</span><small>Contains ads · In-app purchases</small></div></div>
    <div class="stats"><div><b>4.6 ★</b><small>182K reviews</small></div><div><b>10M+</b><small>Downloads</small></div><div><b>Teen</b><small>Rated</small></div></div>
    <button class="install" data-act="4">Install</button>
    <div class="shots"><i></i><i></i><i></i></div>
    <h4>About this game</h4><p>${esc(s.genre)} · ${esc(s.about)}</p>
    <div class="store-url">${esc(shortIds(s.url))}</div></div>`;
}

function appStore(s: ScreenOf<'store'>) {
  return `<div class="store ios" style="${colors(s.game)}">
    <div class="app-head">${icon(s.game)}<div><h2>${esc(s.game)}</h2><span class="dev">${esc(s.developer)}</span><br><button class="get" data-act="4">Get</button></div></div>
    <div class="stats"><div><b>4.7</b><small>★★★★★</small></div><div><b>12+</b><small>Age</small></div><div><b>#8</b><small>${esc(s.genre)}</small></div></div>
    <div class="shots"><i></i><i></i><i></i></div>
    <h4>${esc(s.genre)}</h4><p>${esc(s.about)}</p>
    <div class="store-url">${esc(shortIds(s.url))}</div></div>`;
}

/** Makes the Start button pulse when Start is the next step. */
const START_PULSE =
  'form button{animation:p 1.8s ease-out infinite}@keyframes p{0%{box-shadow:0 0 0 0 #22c55e99}70%{box-shadow:0 0 0 12px #22c55e00}}';

/**
 * The demo page's colour scheme and colours, mapped onto the variables Freecash's page uses
 * (html.ts), so the page inside the phone matches the page around it. An iframe's own
 * prefers-color-scheme follows the system, not the page around it.
 */
function themeCss() {
  const root = getComputedStyle(document.documentElement);
  const token = (name: string) => root.getPropertyValue(name);
  return `:root{color-scheme:${root.colorScheme};--bg:${token('--bg')};--card:${token('--panel')};--text:${token('--text')};--muted:${token('--muted')}}`;
}

/**
 * Shows a real Freecash page in the iframe. Its Start form and links are wired to the demo instead
 * of navigating: the form runs step 3, the progress link opens the progress tab.
 */
export function mountWeb(
  frame: HTMLIFrameElement,
  html: string,
  on: { startIsNext: boolean; start(): void; progress(): void },
) {
  frame.addEventListener('load', () => {
    const doc = frame.contentDocument;
    if (!doc) return;
    doc.addEventListener('submit', (e) => {
      e.preventDefault();
      on.start();
    });
    for (const a of doc.querySelectorAll('a')) {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        if (a.getAttribute('href')?.startsWith('/p/')) on.progress();
      });
    }
  });
  const css = `${themeCss()}${on.startIsNext ? START_PULSE : ''}`;
  frame.srcdoc = html.replace('</head>', `<style>${css}</style></head>`);
}
