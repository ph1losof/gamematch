/**
 * The journey page. Every action posts to /api and gets the whole state back; render() redraws
 * the panels from it (panels.ts) and the phone plays the action's screens in order (phone.ts),
 * e.g. "Opening the store…" then the store.
 */
import {
  type Busy,
  ledgerHtml,
  networkHtml,
  notesHtml,
  outcomeHtml,
  personaHtml,
  stepsHtml,
  timelineHtml,
  withChoice,
} from './panels';
import type { Persona } from './persona';
import { caption, mountWeb, type PhoneContext, screenHtml } from './phone';
import type { JourneyState, ProgressReply, Screen } from './types';

/** How long the phone shows each screen of a step before the next, so a viewer can follow. Our design choice. */
const SCREEN_MS = 1300;
/** The competitor's ad stays up longer: it is the turn the viewer should notice. Our design choice. */
const OTHER_AD_MS = 1800;
/** How long an error message stays up. Our design choice. */
const TOAST_MS = 3200;

/** What an action posts: a persona to reset to, a goal to play, or time to travel. */
type ActionBody = Persona | { event?: string } | { days: number; release: boolean };

let state: JourneyState | null = null;
let prev: JourneyState | null = null;
let busy: Busy = null;
let tab: 'screen' | 'progress' = 'screen';
let screenTimers: number[] = [];

function el<T extends HTMLElement = HTMLElement>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`index.html has no ${selector}`);
  return found;
}

const messageOf = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));

// ------------------------------------------------------------------ API

/** A request to server.ts; a 409 carries the reason the step can't run. */
async function request(path: string, body?: ActionBody): Promise<Response> {
  const init =
    body === undefined
      ? undefined
      : {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        };
  const res = await fetch(`/api${path}`, init);
  if (res.ok) return res;
  throw new Error(res.status === 409 ? await res.text() : `HTTP ${res.status}`);
}

async function fetchState(path: string, body?: ActionBody): Promise<JourneyState> {
  const res = await request(path, body);
  // SAFETY: server.ts answers /state and every action with Journey.state().
  return (await res.json()) as JourneyState;
}

async function fetchProgress(): Promise<ProgressReply> {
  const res = await request('/progress');
  // SAFETY: server.ts answers /progress with a ProgressReply.
  return (await res.json()) as ProgressReply;
}

/** Runs one action at a time; a click while one runs is ignored. */
async function act(kind: NonNullable<Busy>, path: string, body: ActionBody = {}) {
  if (busy !== null) return;
  busy = kind;
  renderControls();
  try {
    apply(await fetchState(path, body));
  } catch (cause) {
    toast(messageOf(cause));
  } finally {
    busy = null;
    renderControls();
  }
}

const runStep = (n: number, event?: string) =>
  act(n, `/step/${n}`, event === undefined ? {} : { event });

function apply(next: JourneyState) {
  const screensChanged =
    state === null || JSON.stringify(state.screens) !== JSON.stringify(next.screens);
  prev = state;
  state = next;
  markTab('screen');
  render(next);
  playScreens(next.screens, screensChanged);
}

// ------------------------------------------------------------------ render

function render(s: JourneyState) {
  const d = new Date(s.now);
  const hhmm = d.toISOString().slice(11, 16);
  el('#clock').textContent =
    `Day ${Math.floor(s.day)} · ${d.toUTCString().slice(0, 11)} ${hhmm} UTC`;
  el('#sb-time').textContent = hhmm;
  el('#phone').dataset.platform = s.persona.platform;
  el<HTMLButtonElement>('[data-tab="progress"]').disabled = !s.startId;
  el('#notes').innerHTML = notesHtml(s);
  el('#outcome').innerHTML = outcomeHtml(s);
  el('#network').innerHTML = networkHtml(s);
  el('#ledger').innerHTML = ledgerHtml(s, prev);
  renderControls();
  renderTimeline();
}

/** The panels whose buttons are disabled while an action runs. */
function renderControls() {
  if (!state) return;
  el('#steps').innerHTML = stepsHtml(state, busy);
  el('#persona').innerHTML = personaHtml(state, busy);
}

/** The hop list, scrolled to the newest hop. */
function renderTimeline() {
  if (!state) return;
  const list = el('#timeline');
  list.innerHTML = timelineHtml(state, prev, el<HTMLInputElement>('#show-admin').checked);
  el('#hop-count').textContent = `${state.timeline.length} hops`;
  list.scrollTop = list.scrollHeight;
}

// ------------------------------------------------------------------ phone

const phoneContext = (): PhoneContext => ({
  inApp: state?.persona.inApp ?? false,
  linkedGame: state?.linkedGame.name ?? '',
});
const nextStep = () => state?.steps.find((s) => s.status === 'next')?.n ?? null;

/** Shows a step's screens one after another, or just the last one when nothing changed. */
function playScreens(screens: Screen[], animate: boolean) {
  for (const timer of screenTimers) clearTimeout(timer);
  screenTimers = [];
  const last = screens.at(-1);
  if (!animate) {
    if (last) showScreen(last, false);
    return;
  }
  let at = 0;
  for (const s of screens) {
    screenTimers.push(window.setTimeout(() => showScreen(s, true), at));
    at += s.kind === 'other-ad' ? OTHER_AD_MS : SCREEN_MS;
  }
}

function showScreen(s: Screen, animate: boolean) {
  const screen = el('#screen');
  screen.classList.remove('enter');
  if (animate) {
    void screen.offsetWidth; // a reflow, so the CSS animation starts again
    screen.classList.add('enter');
  }
  screen.innerHTML = screenHtml(s, phoneContext());
  highlightNextAct(screen);
  const frame = screen.querySelector('iframe');
  if (s.kind === 'web' && frame) {
    mountWeb(frame, s.html, {
      startIsNext: nextStep() === 3,
      start: () => tapIfNext(3),
      progress: () => showProgress(),
    });
  }
  el('#caption').textContent = caption(s, phoneContext());
}

/** Marks the control on the phone that runs the next step. */
function highlightNextAct(screen: HTMLElement) {
  const next = nextStep();
  for (const control of screen.querySelectorAll<HTMLElement>('[data-act]')) {
    const isNext = Number(control.dataset.act) === next;
    control.classList.toggle('hot', isNext);
    control.classList.toggle('idle', !isNext);
  }
}

/** A tap on the phone runs its step only when that step is next. */
function tapIfNext(step: number) {
  if (step === nextStep()) runStep(step);
}

function markTab(name: 'screen' | 'progress') {
  tab = name;
  for (const b of document.querySelectorAll<HTMLButtonElement>('.phone-tabs button'))
    b.classList.toggle('on', b.dataset.tab === name);
}

function showScreenTab() {
  markTab('screen');
  const last = state?.screens.at(-1);
  if (last) showScreen(last, false);
}

/** The progress tab loads Freecash's real progress page for the current start. */
async function showProgress() {
  markTab('progress');
  try {
    const reply = await fetchProgress();
    prev = state;
    state = reply.state;
    render(reply.state);
    if (tab === 'progress') showScreen(reply.screen, true);
  } catch (cause) {
    toast(messageOf(cause));
  }
}

// ------------------------------------------------------------------ events

function toast(message: string) {
  document.querySelector('.toast')?.remove();
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = message;
  document.body.append(t);
  setTimeout(() => t.remove(), TOAST_MS);
}

/** What a click on each kind of control does; the first selector the click is inside wins. */
const CLICKS: [string, (control: HTMLElement, s: JourneyState) => void][] = [
  ['[data-persona]', (b, s) => resetTo(withChoice(s, b.dataset.persona, Number(b.dataset.option)))],
  ['[data-step]', (b) => runStep(Number(b.dataset.step))],
  ['[data-goal]', (b) => runStep(5, b.dataset.goal)],
  [
    '[data-days]',
    (b) => act('time', '/time', { days: Number(b.dataset.days), release: 'release' in b.dataset }),
  ],
  ['[data-act]', (b) => tapIfNext(Number(b.dataset.act))],
  ['[data-tab="screen"]', () => showScreenTab()],
  ['[data-tab="progress"]', () => showProgress()],
  ['#sync', () => act('time', '/spend/sync')],
  ['#reset', (_, s) => resetTo(s.persona)],
];

function resetTo(persona: Persona | null) {
  if (persona) act('reset', '/reset', persona);
}

document.addEventListener('click', (e) => {
  const origin = e.target;
  if (!(origin instanceof Element) || !state) return;
  for (const [selector, handle] of CLICKS) {
    const control = origin.closest<HTMLElement>(selector);
    if (control) {
      handle(control, state);
      return;
    }
  }
});

el('#show-admin').addEventListener('change', () => renderTimeline());

/** Space or → runs the next step. */
document.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey) return;
  if (e.key !== ' ' && e.key !== 'ArrowRight') return;
  e.preventDefault();
  const n = nextStep();
  if (n) runStep(n);
});

fetchState('/state').then(apply, (cause) =>
  toast(`Can't reach the demo server: ${messageOf(cause)}`),
);
