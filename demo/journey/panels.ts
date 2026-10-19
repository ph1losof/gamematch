/**
 * The page's panels around the phone: persona, steps and goals, notes, who gets what, the ad
 * network's view, the hop timeline and the ledger. Each is a pure function from the journey state
 * (and the previous one, to flash what changed) to HTML; app.ts puts them on the page.
 */
import { esc } from '../../src/freecash/html';
import type { Platform } from '../../src/shared/types';
import { shortIds, usd } from './format';
import { DEFAULT_PERSONA, ENDING_TEXT, expectedEnding, HELP, type Persona } from './persona';
import type {
  GoalStatus,
  GoalView,
  JourneyState,
  LedgerRow,
  Note,
  StepView,
  TimelineEntry,
} from './types';

/** What is running: a step number, time travel / spend sync, or a reset. */
export type Busy = number | 'time' | 'reset' | null;

// ------------------------------------------------------------------ persona

/** One persona choice and its options; `only` is the platform it exists on. */
type Choice<K extends keyof Persona> = {
  key: K;
  label: string;
  options: [Persona[K], string][];
  only?: Platform;
};
type AnyChoice = { [K in keyof Persona]: Choice<K> }[keyof Persona];

/** A yes/no choice whose default is no, shown first. */
const offOn = (off: string, on: string): [boolean, string][] => [
  [false, off],
  [true, on],
];
/** ATT is allowed by default. */
const ATT_OPTIONS: [boolean, string][] = [
  [true, 'Allowed'],
  [false, 'Denied'],
];

function personaChoices(linkedGame: string): AnyChoice[] {
  return [
    {
      key: 'platform',
      label: 'Platform',
      options: [
        ['android', 'Android'],
        ['ios', 'iOS'],
      ],
    },
    {
      key: 'linkedGame',
      label: 'Linked game',
      options: [
        ['kingdom-clash', 'Kingdom Clash · strategy'],
        ['jewel-mania', 'Jewel Mania · puzzle'],
      ],
    },
    {
      key: 'segment',
      label: 'Segment',
      options: [
        ['hot', 'Hot · 1 day'],
        ['warm', 'Warm · 7 days'],
        ['cold', 'Cold · 30 days'],
      ],
    },
    { key: 'inApp', label: 'Freecash app', options: offOn('Web fallback', 'Installed, logged in') },
    {
      key: 'attInAdGame',
      label: `ATT in ${linkedGame}`,
      options: ATT_OPTIONS,
      only: 'ios',
    },
    {
      key: 'attInOfferGame',
      label: 'ATT in the offer game',
      options: ATT_OPTIONS,
      only: 'ios',
    },
    { key: 'optedOut', label: 'Ad ID', options: offOn('Available', 'Opted out'), only: 'android' },
    { key: 'reinstall', label: 'Had the offer game', options: offOn('Never', 'Yes (reinstall)') },
    { key: 'competitor', label: 'Competitor ad', options: offOn('No', 'Taps one later') },
  ];
}

/** The persona with option `index` of choice `key` picked, as a persona button names it; null if none. */
export function withChoice(
  s: JourneyState,
  key: string | undefined,
  index: number,
): Persona | null {
  const choice = personaChoices(s.linkedGame.name).find((c) => c.key === key);
  const option = choice?.options[index];
  return choice && option ? { ...s.persona, [choice.key]: option[0] } : null;
}

export function personaHtml(s: JourneyState, busy: Busy) {
  const p = s.persona;
  const rows = personaChoices(s.linkedGame.name).map((c) => choiceHtml(c, p, busy !== null));
  const shortcuts = `<details class="earlier"><summary>Demo shortcuts (${s.shortcuts.length})</summary><ul>${s.shortcuts.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></details>`;
  return `<header><h2>Persona · <b class="persona-name">Alex Kim, plays ${esc(s.linkedGame.name)}</b></h2><span class="meta">changing it resets</span></header>
    ${rows.join('')}<div class="expect"><b>Expected:</b> ${esc(ENDING_TEXT[expectedEnding(p)])}</div>${shortcuts}`;
}

function choiceHtml(c: AnyChoice, p: Persona, busy: boolean) {
  const off = c.only !== undefined && c.only !== p.platform;
  const changed = !off && p[c.key] !== DEFAULT_PERSONA[c.key];
  const buttons = c.options.map(
    ([value, label], i) =>
      `<button data-persona="${c.key}" data-option="${i}" class="${p[c.key] === value ? 'on' : ''}" ${off || busy ? 'disabled' : ''}>${esc(label)}</button>`,
  );
  const only = c.only
    ? `<span class="only">${c.only === 'ios' ? 'iOS' : 'Android'} only</span>`
    : '';
  return `<div class="prow ${off ? 'off' : ''} ${changed ? 'changed' : ''}">
      <div class="plabel">${esc(c.label)}${only}</div>
      <div class="seg">${buttons.join('')}</div>
      <p class="phint">${esc(HELP[c.key])}</p>
    </div>`;
}

// ------------------------------------------------------------------ steps and goals

const STEP_SUB = [
  'Enroll · launch both offers for this segment · refresh audiences · ad request',
  'Network click URL → Freecash MMP → /go → landing page',
  'POST Start → click ID → “Opening the store…” → advertiser MMP → store',
  'Game SDK first open → advertiser MMP attributes → postback',
  'Game SDK event → MMP → postback → reward + bill',
];

export function stepsHtml(s: JourneyState, busy: Busy) {
  const steps = s.steps.map((step, i) => stepHtml(step, STEP_SUB[i] ?? '', busy));
  const installed = s.steps.some((step) => step.n === 4 && step.status === 'done');
  const goals = s.matched
    ? `<div class="goals"><h3>${esc(s.matched.game)} goal ladder${installed ? '' : ' <span class="meta">playable after install</span>'}</h3><table class="goal-table"><thead><tr><th>Goal</th><th class="num">Reward</th><th>Status</th></tr></thead><tbody>${s.goals.map((g) => goalRow(g, installed, busy)).join('')}</tbody></table></div>`
    : '';
  return `<header><h2>Journey</h2></header><ol class="steps">${steps.join('')}</ol>${goals}${timeTravelHtml(s, busy)}`;
}

/** What sits at a step's right: the Run button on the next step, a status word on the rest. */
function stepAction(step: StepView, busy: Busy) {
  if (step.status === 'next') {
    const label = busy === step.n ? 'Running…' : 'Run step';
    return `<button class="btn primary" data-step="${step.n}" ${busy !== null ? 'disabled' : ''}>${label}</button>`;
  }
  const word = { blocked: 'Blocked', done: 'Done', locked: '' };
  return `<span class="state">${word[step.status]}</span>`;
}

function stepHtml(step: StepView, sub: string, busy: Busy) {
  return `<li class="step s-${step.status}">
        <span class="n">${step.n}</span><span class="body"><span class="t">${esc(step.title)}</span><span class="s">${esc(sub)}</span></span>${stepAction(step, busy)}
      </li>`;
}

function timeTravelHtml(s: JourneyState, busy: Busy) {
  const off = busy === 'time' ? 'disabled' : '';
  const { boostHours, holdDays } = s.rules;
  const boostDays = Math.ceil(boostHours / 24);
  return `<div class="time"><span class="label">Time travel</span>
      <button class="btn" data-days="1" ${off}>+1 day</button>
      <button class="btn" data-days="${boostDays}" ${off}>+${boostDays} days <span class="muted">(${boostHours} h bonus ends)</span></button>
      <button class="btn" data-days="${holdDays + 1}" data-release ${off}>+${holdDays + 1} days → release rewards</button>
      <button class="btn" id="sync" ${off}>Sync spend</button></div>`;
}

const STATUS_TEXT = {
  open: 'open',
  held: 'on hold',
  cashable: 'cashable',
  expired: "time's up",
  reversed: 'reversed',
  no_postback: 'no postback',
  converted: 'paid',
  duplicate: 'duplicate',
  rejected_by_mmp: 'rejected',
  unknown_click: 'unknown click',
  not_a_goal: 'not a goal',
  before_start: 'before start',
  past_deadline: 'past deadline',
  device_mismatch: 'other device',
  already_converted: 'already paid',
} satisfies Record<GoalStatus, string>;

/** One goal: its name, the user's reward, and its status, or a Play button when it can be played. */
function goalRow(g: GoalView, installed: boolean, busy: Busy) {
  const lost = !['open', 'held', 'cashable'].includes(g.status);
  const playable = installed && g.event !== 'install' && g.status === 'open';
  const purchase = g.requiresPurchase ? ' <span class="meta">purchase</span>' : '';
  const bonus = g.boosted ? ' <span class="meta">linked-player bonus</span>' : '';
  const status = playable
    ? `<button class="btn sm" data-goal="${esc(g.event)}" ${busy === null ? '' : 'disabled'}>Play</button>`
    : esc(STATUS_TEXT[g.status]);
  return `<tr class="${lost ? 'lost' : ''}" title="pays ${usd(g.payout)} · user gets ${usd(g.reward)} · ${g.deadlineDays} days">
    <td>${esc(g.label)}${purchase}${bonus}</td><td class="num">${usd(g.reward)}</td><td class="gs ${g.status}">${status}</td></tr>`;
}

// ------------------------------------------------------------------ notes and outcome

const noteHtml = (n: Note) =>
  `<div class="note ${n.tone}"><div class="grp">${esc(n.group)}</div><h3>${esc(n.title)}</h3><ul>${n.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul></div>`;

export function notesHtml(s: JourneyState) {
  const last = s.notes.at(-1);
  const intro = `<p class="muted">Alex is a Freecash user who linked ${esc(s.linkedGame.name)}. Run step 1 to launch the campaigns and open the game.</p>`;
  const earlier = s.notes.slice(0, -1).reverse();
  const older = earlier.length
    ? `<details class="earlier"><summary>Earlier steps (${earlier.length})</summary>${earlier.map(noteHtml).join('')}</details>`
    : '';
  return `<header><h2>What just happened</h2></header>${last ? noteHtml(last) : intro}${older}`;
}

/** Sum of the ledger rows whose account starts with `prefix`. */
const owedOn = (s: JourneyState, prefix: string) =>
  s.ledger.rows.filter((r) => r.account.startsWith(prefix)).reduce((t, r) => t + r.amount, 0);

export function outcomeHtml(s: JourneyState) {
  const a = s.attribution;
  const verdict = a?.title ?? s.blocked ?? 'Install not attributed yet';
  return `<header><h2>Who gets what</h2></header>
    <div class="verdict ${a?.tone ?? ''}"><span class="dot"></span><div><b>${esc(verdict)}</b></div></div>
    <dl class="whogets">
      <dt>Rewarded</dt><dd>${rewardedHtml(s)}</dd>
      <dt>Billed</dt><dd>${billedHtml(s)}</dd>
      <dt>We pay</dt><dd>${networkPaidHtml(s)}</dd>
    </dl>`;
}

function rewardedHtml(s: JourneyState) {
  const held = owedOn(s, 'user_pending:');
  const cash = owedOn(s, 'user:');
  if (!held && !cash) return 'nobody yet';
  return `Alex: <b>${usd(held)}</b> on hold · <b>${usd(cash)}</b> cashable <small>(held ${s.rules.holdDays} days, then cashable)</small>`;
}

function billedHtml(s: JourneyState) {
  const billed = s.ledger.rows.filter((r) => r.account.startsWith('advertiser:') && r.amount);
  if (!billed.length) return 'nobody yet';
  const each = billed.map(
    (b) => `${esc(b.label.replace(' owes us', ''))}: <b>${usd(b.amount)}</b>`,
  );
  return `${each.join(' · ')} <small>(on each accepted postback)</small>`;
}

function networkPaidHtml(s: JourneyState) {
  const owed = owedOn(s, 'network:');
  if (!owed) return 'nothing booked yet';
  const impressions = s.network.reduce((t, c) => t + c.impressions, 0);
  return `the ad network <b>${usd(owed)}</b> for ${impressions} impression${impressions === 1 ? '' : 's'} <small>(whether or not it converts)</small>`;
}

// ------------------------------------------------------------------ network

export function networkHtml(s: JourneyState) {
  const header = `<header><h2>Ad network's view</h2><span class="meta">campaign reports (as GET /admin/campaigns/:id)</span></header>`;
  if (!s.network.length) return `${header}<p class="muted">No campaigns yet.</p>`;
  const rows = s.network.map((c) => {
    const conversions = Object.entries(c.conversions).map(([k, v]) => `${esc(k)} ${v}`);
    return `<tr class="${c.matched ? 'matched' : ''}"><td>${esc(c.offer)}</td><td>${usd(c.bidCpm)}</td><td>${c.audience}</td><td>${c.impressions}</td><td>${c.clicks}</td><td>${usd(c.spendReported)}</td><td>${conversions.join(', ') || '—'}</td></tr>`;
  });
  return `${header}<table class="net"><thead><tr><th>Campaign</th><th>Bid CPM</th><th>Audience</th><th>Impr.</th><th>Clicks</th><th>Spend</th><th>Conversions</th></tr></thead><tbody>${rows.join('')}</tbody></table>
    <p class="net-foot">One campaign per offer × platform × segment. Conversions are what Freecash's MMP posted back to the network (it optimises on offer starts).</p>`;
}

// ------------------------------------------------------------------ timeline

/** The hops, grouped by the action that caused them; hops new since `prev` are marked. */
export function timelineHtml(s: JourneyState, prev: JourneyState | null, showAdmin: boolean) {
  const lastSeen = prev?.timeline.at(-1)?.seq ?? 0;
  let group = '';
  const parts: string[] = [];
  for (const e of s.timeline) {
    if (!showAdmin && e.admin) continue;
    if (e.group !== group) {
      group = e.group;
      parts.push(`<li class="tl-group">${esc(group)}</li>`);
    }
    parts.push(hopHtml(e, prev !== null && e.seq > lastSeen));
  }
  return (
    parts.join('') ||
    `<li class="empty">No requests yet. Each hop between the phone, the games, the ad network, the two MMPs and Freecash appears here.</li>`
  );
}

function hopHtml(e: TimelineEntry, isNew: boolean) {
  const u = new URL(e.url);
  const path = shortIds(decodeURIComponent(u.pathname + u.search));
  const loc = e.location
    ? `<span class="loc">→ ${esc(shortIds(e.location.replace(/^https?:\/\//, '')))}</span>`
    : '';
  return `<li class="hop ${e.admin ? 'admin' : ''} ${isNew ? 'new' : ''}" style="--depth:${e.depth}" title="${esc(e.url)}">
    <div class="req"><span class="seq">${e.seq}</span>${statusHtml(e.status)}<span class="method">${esc(e.method)}</span><span class="url"><span class="host">${esc(u.host)}</span>${esc(path)}</span>${loc}</div>
    <div class="what"><span class="ft">${esc(e.from)} → ${esc(e.to)}</span> ${esc(e.text)}</div>
    ${e.detail ? `<div class="detail">${esc(e.detail)}</div>` : ''}
  </li>`;
}

/** The HTTP status as a neutral pill, red for errors; the store is outside the System and has none. */
function statusHtml(status: number | null) {
  if (status === null) return `<span class="st x">ext</span>`;
  const kind = status >= 400 ? 'e' : '';
  return `<span class="st ${kind}">${status}</span>`;
}

// ------------------------------------------------------------------ ledger

export function ledgerHtml(s: JourneyState, prev: JourneyState | null) {
  const before = new Map(prev?.ledger.rows.map((r) => [r.account, r.amount]));
  const row = (r: LedgerRow) => {
    const delta = r.amount - (before.get(r.account) ?? 0);
    const changed = prev !== null && delta !== 0;
    const shown = changed
      ? `<span class="delta ${signClass(delta)}">${delta > 0 ? '+' : ''}${usd(delta)}</span>`
      : '';
    return `<tr class="${changed ? 'flash' : ''}"><td>${esc(r.label)}<small class="acct">${esc(shortIds(r.account))}</small></td><td class="num">${shown}</td><td class="num ${signClass(r.amount)}">${usd(r.amount)}</td></tr>`;
  };
  const section = (kind: LedgerRow['kind'], title: string) => {
    const rows = s.ledger.rows.flatMap((r) => (r.kind === kind ? [row(r)] : [])).join('');
    return `<tbody><tr class="lhead"><th colspan="3">${title}</th></tr>${rows || '<tr><td class="muted" colspan="3">Nothing yet.</td></tr>'}</tbody>`;
  };
  const balanced = s.ledger.total === 0;
  return `<header><h2>Ledger</h2><span class="meta">double-entry, micro-dollars</span></header>
    <table class="ledger">${section('owed', 'Who owes whom')}${section('pnl', 'Profit &amp; loss')}</table>
    <div class="lfoot"><span>Ledger total <b class="num">${usd(s.ledger.total)}</b> <span class="${balanced ? 'pos' : 'neg'}">${balanced ? 'Balanced' : 'Unbalanced'}</span></span><span>Freecash margin so far <b class="num ${signClass(s.ledger.margin)}">${usd(s.ledger.margin)}</b></span></div>`;
}

/** Green for a positive amount, red for a negative one, as on the dashboard. */
const signClass = (m: number) => (m > 0 ? 'pos' : m < 0 ? 'neg' : '');
