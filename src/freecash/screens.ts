/**
 * The three screens a user sees between our ad and the game, as pure templates over what
 * landing.ts loads. Built the way rewards apps present offers (Unity/Tapjoy multi-reward offer
 * guidance, https://docs.unity.com/grow/offerwall/user-acquisition/best-practices/multi-rewards-offer-best-practices;
 * KashKick and adjoe progress screens): lead with the quick first goal and the linked-player
 * boost, list every step with its reward and deadline, tag purchase steps, put the rules above
 * the button, then show each goal's state. One template per screen, filled from the offer's
 * goals, so every game gets its own page. Ad IDs aren't secrets, so pages show only a first name
 * and the linked game, never a balance.
 */
import { DAY } from '../shared/clock';
import { fmtUsd, type Micros } from '../shared/money';
import { esc, html } from './html';
import type { Game, Goal } from './offers';
import { type BoostTerms, freeTotal, type Ladder } from './personalise';

/** The "opening the store" page's meta refresh, in seconds: long enough to read one line. Our design choice. */
const FORWARD_DELAY_S = 1;

export type LandingView = {
  clickId: string;
  offerId: string;
  game: Game;
  ladder: Ladder<Goal>;
  lead: Goal;
  visitor: { firstName: string; linkedGames: { name: string; genre: string }[] } | null;
  boost: BoostTerms | null;
  boostHours: number;
  holdDays: number;
};
export type VerifyingView = {
  startId: string;
  gameName: string;
  trackingUrl: string;
  autoForward: boolean;
};
export type GoalState = {
  kind: 'open' | 'held' | 'cashable' | 'expired' | 'reversed';
  label: string;
};
export type ProgressView = {
  gameName: string;
  installed: boolean;
  goals: { label: string; reward: Micros; state: GoalState }[];
};

/** Why this game: a genre the user plays, else the games they already earn with. */
function whyLine(game: Game, linked: { name: string; genre: string }[]) {
  const sameGenre = linked.find((g) => g.genre === game.genre);
  if (sameGenre)
    return ` You play ${esc(sameGenre.name)}, so we picked a ${esc(game.genre.toLowerCase())} game for you.`;
  if (!linked.length) return '';
  return ` You already earn on Freecash with ${esc(linked.map((g) => g.name).join(' and '))}.`;
}

/** "1 day", "7 days". */
const dayCount = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;

function stepItem(g: Goal, lead: Goal, boost: BoostTerms | null) {
  const reward =
    boost && g.event === boost.event
      ? `${fmtUsd(boost.reward)} <s>${fmtUsd(g.reward)}</s>`
      : fmtUsd(g.reward);
  const days = dayCount(g.deadlineDays);
  const when = g.event === 'install' ? `within ${days}` : `within ${days} of installing`;
  const tag = g.requiresPurchase ? `<i class="tag-p">needs a purchase</i>` : '';
  return `<li${g === lead ? ' class="lead"' : ''}><span>${esc(g.label)} ${tag}<small>${when}</small></span><b>${reward}</b></li>`;
}

export function landingPage(v: LandingView) {
  const { game, lead, boost, visitor } = v;
  const greeting = visitor
    ? `<p class="hi">Hi ${esc(visitor.firstName)}!${whyLine(game, visitor.linkedGames)}</p>`
    : '';
  const banner = boost
    ? `<div class="boost"><b>Linked-player bonus</b> · ${esc(lead.label)} within ${v.boostHours} hours:
       <span class="now">${esc(fmtUsd(boost.reward))}</span> <s>${esc(fmtUsd(lead.reward))}</s></div>`
    : '';
  // The boost is only ever on a no-purchase goal, so it adds to the no-purchase total.
  const upTo = freeTotal(v.ladder) + (boost ? boost.reward - lead.reward : 0);
  const action = visitor
    ? `<form method="post" action="/l/${esc(v.clickId)}/start"><button>Start &amp; install ${esc(game.name)}</button></form>`
    : // Unknown visitor: open the offer in the Freecash app, where the user is logged in.
      `<a class="button" href="freecash://offers/${esc(v.offerId)}">Open Freecash to start</a>`;

  return html(`
    ${greeting}
    <section class="card">
      <p class="tag">New offer · ${esc(game.genre)}</p>
      <h1>Start with ${esc(fmtUsd(boost?.reward ?? lead.reward))}, earn up to ${esc(fmtUsd(upTo))} playing ${esc(game.name)}</h1>
      ${banner}
      <ol>${v.ladder.map((g) => stepItem(g, lead, boost)).join('')}</ol>
      <ul class="rules">
        <li>Only counts if you've never installed ${esc(game.name)} on this phone.</li>
        <li>Install from the next screen and open the game once, so ${esc(game.name)} can confirm it.</li>
        <li>Rewards are paid when ${esc(game.name)} confirms each step, then held ${v.holdDays} days before you can cash out.</li>
      </ul>
      ${action}
    </section>
    <p class="fine">"Earn up to" counts only steps that need no purchase. Terms apply.</p>`);
}

/**
 * After Start: a moment to say what happens next, then on to the store. It forwards by itself only
 * right after Start, so reloading it later doesn't send the MMP a burst of repeat clicks.
 */
export function verifyingPage(v: VerifyingView) {
  return html(
    `<section class="card center">
      <div class="spinner"></div>
      <h1>Opening the store…</h1>
      <p>Install ${esc(v.gameName)} and open it once. We'll confirm your install within minutes, then your first reward is on its way.</p>
      <a class="button" href="${esc(v.trackingUrl)}">Continue to the store</a>
      <p class="fine"><a href="/p/${esc(v.startId)}">Track your progress</a></p>
    </section>`,
    200,
    v.autoForward
      ? `<meta http-equiv="refresh" content="${FORWARD_DELAY_S};url=${esc(v.trackingUrl)}">`
      : '',
  );
}

export function progressPage(v: ProgressView) {
  const rows = v.goals.map(
    (g) =>
      `<li class="${g.state.kind}"><span>${esc(g.label)}<small>${esc(g.state.label)}</small></span><b>${esc(fmtUsd(g.reward))}</b></li>`,
  );
  return html(`
    <section class="card">
      <p class="tag">Your progress</p>
      <h1>${esc(v.gameName)}</h1>
      <p class="hi">${v.installed ? 'Install confirmed.' : 'Waiting for your install…'}</p>
      <ol>${rows.join('')}</ol>
    </section>`);
}

/** One goal's state on the progress page. */
export function goalState(
  goal: Pick<Goal, 'event' | 'deadlineDays'>,
  conversion:
    | { createdAt: number; releasedAt: number | null; reversedAt: number | null }
    | undefined,
  start: { createdAt: number; installedAt: number | null },
  now: number,
  holdDays: number,
): GoalState {
  if (conversion?.reversedAt) return { kind: 'reversed', label: 'Reversed' };
  if (conversion?.releasedAt) return { kind: 'cashable', label: 'Ready to cash out' };
  if (conversion)
    return {
      kind: 'held',
      label: `On hold until ${new Date(conversion.createdAt + holdDays * DAY).toISOString().slice(0, 10)}`,
    };
  const from = goal.event === 'install' ? start.createdAt : start.installedAt;
  if (from === null) return { kind: 'open', label: 'Starts when you install' };
  const left = from + goal.deadlineDays * DAY - now;
  return left < 0
    ? { kind: 'expired', label: "Time's up" }
    : { kind: 'open', label: `${dayCount(Math.ceil(left / DAY))} left` };
}
