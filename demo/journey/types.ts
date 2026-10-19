/**
 * The journey's state as the page receives it. Types only, so the browser (app.ts) can import them
 * without pulling in the server; journey.ts builds a JourneyState after every action.
 */
import type { Outcome } from '../../src/freecash/schema';
import type { GoalState } from '../../src/freecash/screens';
import type { Micros } from '../../src/shared/money';
import type { Creative } from '../../src/shared/types';
import type { Persona } from './persona';

/** The party a hop goes to; it colours the hop in the UI. */
export type Party = 'adnet' | 'fcmmp' | 'freecash' | 'advmmp' | 'store';

export type TimelineEntry = {
  seq: number;
  /** The demo action this hop belongs to, e.g. "2 · Tap the ad". */
  group: string;
  /** 0 for a request the phone, a game or the operator made; 1+ for server-to-server calls it caused. */
  depth: number;
  method: string;
  url: string;
  /** Null for the store, which is outside the System and never answers. */
  status: number | null;
  location: string | null;
  from: string;
  to: string;
  party: Party;
  text: string;
  detail: string | null;
  /** Back-office calls (operator → Freecash and what they trigger). */
  admin: boolean;
  at: number;
};

/** What the phone shows. An action can produce several, played in order. */
export type Screen =
  | { kind: 'home' }
  | { kind: 'game-ad'; creative: Creative; offerGame: string; genre: string; segment: string }
  | { kind: 'game-noad'; reasons: string[] }
  | { kind: 'other-ad'; publisher: string; network: string; offerGame: string; genre: string }
  | { kind: 'web'; url: string; html: string; title: string; inApp: boolean }
  | {
      kind: 'store';
      platform: Persona['platform'];
      game: string;
      genre: string;
      developer: string;
      appId: string;
      url: string;
      about: string;
    }
  | {
      kind: 'game';
      game: string;
      title: string;
      sub: string;
      att: 'allowed' | 'denied' | null;
      notification: { title: string; body: string } | null;
    };

export type Note = {
  group: string;
  title: string;
  lines: string[];
  tone: 'good' | 'warn' | 'bad' | 'info';
};

export type Attribution = { result: string; title: string; detail: string; tone: Note['tone'] };

export type LedgerRow = { account: string; label: string; kind: 'owed' | 'pnl'; amount: Micros };

/**
 * A goal's state: the progress page's (screens.ts GoalState), the outcome of a postback that was
 * recorded but not paid, or `no_postback` when the game reported the goal and nobody told us.
 */
export type GoalStatus = GoalState['kind'] | Outcome | 'no_postback';

export type GoalView = {
  event: string;
  label: string;
  reward: Micros;
  payout: Micros;
  deadlineDays: number;
  requiresPurchase: boolean;
  status: GoalStatus;
  boosted: boolean;
};

export type StepView = { n: number; title: string; status: 'done' | 'next' | 'locked' | 'blocked' };

export type NetworkCampaign = {
  id: string;
  offer: string;
  segment: string;
  bidCpm: Micros;
  audience: number;
  impressions: number;
  clicks: number;
  starts: number;
  spendReported: Micros;
  spendBooked: Micros;
  conversions: Record<string, number>;
  matched: boolean;
};

/** The numbers the page's labels quote, read from the System's config and the MMP mock. */
export type Rules = { holdDays: number; boostHours: number; lookbackDays: number };

export type JourneyState = {
  persona: Persona;
  linkedGame: { name: string; genre: string };
  rules: Rules;
  /** Where the demo takes a short cut the real system wouldn't; shown on the page. */
  shortcuts: string[];
  now: number;
  day: number;
  steps: StepView[];
  blocked: string | null;
  screens: Screen[];
  startId: string | null;
  matched: { offerId: string; game: string; genre: string; campaignId: string } | null;
  attribution: Attribution | null;
  timeline: TimelineEntry[];
  ledger: { rows: LedgerRow[]; total: Micros; margin: Micros };
  network: NetworkCampaign[];
  goals: GoalView[];
  notes: Note[];
};

/** What /api/progress answers: Freecash's progress page as a phone screen, and the state after loading it. */
export type ProgressReply = { screen: Screen; state: JourneyState };
