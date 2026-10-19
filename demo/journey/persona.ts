/**
 * Who the demo user is. Shared by the server (journey.ts) and the browser (app.ts), so it imports
 * types only. Each choice maps to one real mechanism in the system; HELP says which.
 */
import type { Segment } from '../../src/model/segments';
import type { Platform } from '../../src/shared/types';

export type Persona = {
  platform: Platform;
  /** Which of src/seed.ts's LINKED_GAMES the user plays; a genre match nudges the offer choice. */
  linkedGame: 'kingdom-clash' | 'jewel-mania';
  /** Days since last linked-game progress: hot 1, warm 7, cold 30. */
  segment: Segment;
  /** Freecash app installed and logged in: the deep link opens the app with the user's session. */
  inApp: boolean;
  /** iOS: ATT allowed in the linked game (the game that shows the ad). */
  attInAdGame: boolean;
  /** iOS: ATT allowed in the offer game the user installs. */
  attInOfferGame: boolean;
  /** Android: ad ID deleted / personalisation opted out. */
  optedOut: boolean;
  /** The offer game was installed on this phone before (organically). */
  reinstall: boolean;
  /** After tapping Start, the user taps another network's ad for the same game. */
  competitor: boolean;
};

export const DEFAULT_PERSONA: Persona = {
  platform: 'android',
  linkedGame: 'kingdom-clash',
  segment: 'hot',
  inApp: false,
  attInAdGame: true,
  attInOfferGame: true,
  optedOut: false,
  reinstall: false,
  competitor: false,
};

export const SEGMENT_DAYS: Record<Segment, number> = { hot: 1, warm: 7, cold: 30 };

/** One line per choice: what it changes in the journey. */
export const HELP: Record<keyof Persona, string> = {
  platform:
    'Android credits installs via the Play install referrer; iOS only by IDFA, and only with ATT allowed in the app.',
  linkedGame:
    "Personalisation picks the offer with the highest expected margin; a genre match only breaks near-ties. Castle Siege's ladder earns more, so both players get it.",
  segment:
    'Each segment gets its own campaign, bid and headline. Hot players are worth a higher bid.',
  inApp:
    "In the app, the user's session says who they are. On the web fallback, the ad ID in the click URL does.",
  attInAdGame:
    "Off: the linked game sends a zeroed IDFA, so the network can't match our audience and no ad is shown.",
  attInOfferGame:
    "Off: the advertiser's MMP can't match the install to our click (SKAN only), so it's organic and nobody is paid.",
  optedOut:
    "On: zeroed GAID. The user can't be targeted by device ID, so they're not enrolled and see no ad.",
  reinstall:
    'On: the MMP has seen the offer game on this device before. A reinstall credits nobody.',
  competitor:
    "On: another network's later click wins last-click attribution. We paid for the impression and earn nothing.",
};

/** Where a journey ends, as far as money goes. */
export type Ending = 'no-ad' | 'organic' | 'reinstall' | 'competitor' | 'credited';

/** What the persona should end in, said before running it. The tests check every persona against it. */
export function expectedEnding(p: Persona): Ending {
  if (p.platform === 'android' && p.optedOut) return 'no-ad';
  if (p.platform === 'ios' && !p.attInAdGame) return 'no-ad';
  if (p.platform === 'ios' && !p.attInOfferGame) return 'organic';
  if (p.reinstall) return 'reinstall';
  if (p.competitor) return 'competitor';
  return 'credited';
}

/** The expected ending in words, on the persona panel. */
export const ENDING_TEXT = {
  'no-ad':
    'No ad: the ad ID is zeroed (GAID opted out, or no ATT in the linked game), so nothing matches.',
  organic: 'Organic install: no IDFA in the offer game, no postback, nobody paid.',
  reinstall: 'Reinstall: nobody is credited, nothing is paid.',
  competitor: 'Another network is credited: we paid for the ad and earn nothing.',
  credited: 'Credited to Freecash: user rewarded (on hold first), advertiser billed per goal.',
} satisfies Record<Ending, string>;
