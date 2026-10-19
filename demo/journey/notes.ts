/**
 * The sentences of the "What just happened" notes: what each step did and who it credited, paid or
 * refused. Pure functions of facts the journey has already read, so nothing here touches the System
 * and every sentence can be read next to what it is built from.
 */
import type { Goal } from '../../src/freecash/offers';
import type { Arm, Outcome } from '../../src/freecash/schema';
import type { LandingView } from '../../src/freecash/screens';
import { MEDIA_SOURCE } from '../../src/seed';
import { fmtUsd, type Micros } from '../../src/shared/money';
import type { Platform } from '../../src/shared/types';
import type { Attribution, Note } from './types';

/** What each postback outcome means for the money. */
export const OUTCOME_TEXT: Record<Outcome, string> = {
  converted: 'user rewarded and advertiser billed, one transaction',
  rejected_by_mmp: "the MMP's fraud tool rejected it: recorded, nothing paid",
  unknown_click: 'not a click ID we issued: recorded, nothing paid',
  not_a_goal: 'not a paid goal: recorded, nothing paid',
  before_start: 'event before the start: recorded, nothing paid',
  past_deadline: "past the goal's deadline: recorded, nothing paid",
  device_mismatch: 'different device than the one we sent: recorded, nothing paid',
  already_converted: 'this goal was already paid: recorded, nothing paid',
  duplicate: 'a redelivery of a postback already recorded: dropped',
};

/** Shortens a generated ID for a sentence. */
export const shortId = (id: string) => (id.length > 14 ? `${id.slice(0, 12)}…` : id);

export const dayCount = (n: number) => `${n} day${n === 1 ? '' : 's'}`;

/** Step 1's note: who was enrolled, which offer the audience plan picked, and the ad if one ran. */
export function openGameLines(f: {
  segment: string;
  platform: Platform;
  segmentDays: number;
  linked: { name: string; genre: string };
  matched: { name: string; genre: string } | null;
}) {
  const lines = [
    `Enrolled Alex (${f.segment}: last played ${f.linked.name} ${dayCount(f.segmentDays)} ago) and launched one ${f.segment} campaign per offer on ${f.platform}.`,
  ];
  if (f.matched)
    lines.push(
      `Personalisation: Alex plays ${f.linked.name} (${f.linked.genre}), so the audience plan puts them only in ${f.matched.name}'s campaign (${f.matched.genre}): the highest expected margin, where a genre match only breaks near-ties. Our campaigns never bid against each other.`,
    );
  return lines;
}

/** Step 1's note when the ad ran: how it was matched and paid for. */
export function adShownLines(f: {
  publisher: string;
  game: string;
  segment: string;
  headline: string;
}) {
  return [
    `${f.publisher}'s ad SDK sent Alex's ad ID; the network matched it to our ${f.game} audience and won the auction at our bid (demo shortcut: floor $0). The impression is charged now, whatever happens next.`,
    `The creative is built from the offer's goal table for the ${f.segment} segment: "${f.headline}".`,
  ];
}

/** Why the ad slot stayed empty, most basic reason first. */
export function noAdReasons(f: {
  platform: Platform;
  publisher: string;
  zeroedAdId: boolean;
  arm: Arm | null;
  matched: boolean;
}): [string, ...string[]] {
  const found = [
    f.zeroedAdId ? zeroedAdIdReason(f.platform, f.publisher) : null,
    testReason(f.arm, f.matched),
  ].flatMap((reason) => (reason === null ? [] : [reason]));
  const [first, ...rest] = found;
  return first === undefined
    ? ['The network found no campaign above the floor for this device.']
    : [first, ...rest];
}

function zeroedAdIdReason(platform: Platform, publisher: string) {
  return platform === 'android'
    ? `Alex opted out of ad personalisation, so ${publisher} sends a zeroed GAID. A zeroed ID matches no device-ID audience.`
    : `Alex didn't allow tracking in ${publisher}, so its ad SDK sends a zeroed IDFA. A zeroed ID matches no device-ID audience.`;
}

/** Where Alex stands in the test, when that alone keeps the ad away. */
function testReason(arm: Arm | null, matched: boolean) {
  if (arm === null)
    return "Alex isn't in the test: there's no targetable ad ID on file, so device-ID ads can't reach them at all.";
  if (arm === 'control')
    return 'Alex is in the control arm: never uploaded to a network, to measure what happens without ads.';
  if (!matched)
    return 'Alex is in no audience: every launched offer is a game they already play or started.';
  return null;
}

/** Step 2's note: how the click reached the page, and what the page offers. */
export function landingLines(inApp: boolean, page: LandingView) {
  const { lead, boost } = page;
  const bonus = boost
    ? `, boosted from ${fmtUsd(lead.reward)} to ${fmtUsd(boost.reward)} if reached within ${page.boostHours} h (the linked-player bonus)`
    : '';
  return [
    "The click URL points at Freecash's own MMP (a re-engagement link). It records the network's click, then deep-links to /go/:campaign.",
    inApp
      ? 'The Freecash app is installed, so the universal link opens in the app: the logged-in session identifies Alex.'
      : 'No Freecash app on this phone, so the link opens in the browser: Alex is identified by the ad ID the network put in the URL.',
    `The page leads with the quick first goal, "${lead.label}"${bonus}, lists every step with its reward and deadline, and puts the rules above the button.`,
    "No money moves and the advertiser's tracking link has not been fired: a view or a click never starts an offer.",
  ];
}

/** Step 3's note: the click ID, the server-to-server start event, and how the install can be matched. */
export function startLines(f: { clickId: string; advertiser: string; storeUrl: string }) {
  const referrer = new URL(f.storeUrl).searchParams.get('referrer');
  return [
    `Freecash minted click ID ${shortId(f.clickId)}: the only thing that will tie an install to Alex, a reward and a bill to ${f.advertiser}.`,
    'It also told its own MMP "offer_started" (server to server). The MMP credited the ad network\'s re-engagement click and posted back, so the network can optimise on starts.',
    `The "Opening the store…" page moved on to ${f.advertiser}'s tracking link with our click ID and the device's ad ID; their MMP recorded the click and redirected to the store.`,
    referrer
      ? `Android: the Play URL carries referrer=${shortId(referrer)}, so the first open can be matched deterministically, even with a zeroed GAID.`
      : 'iOS: no install referrer. The MMP can only match the first open by IDFA, and only if Alex allows tracking in the game.',
  ];
}

/** The advertiser MMP's attribution result, explained. Anything else is another network's name. */
export function describeAttribution(
  result: string,
  ctx: { platform: Platform; attInOfferGame: boolean; game: string; lookbackDays: number },
): Attribution {
  const bad = (title: string, detail: string): Attribution => ({
    result,
    title,
    detail,
    tone: 'bad',
  });
  switch (result) {
    case MEDIA_SOURCE:
      return {
        result,
        title: `Install credited to Freecash (${MEDIA_SOURCE})`,
        tone: 'good',
        detail:
          ctx.platform === 'ios'
            ? `${ctx.game} read the IDFA (ATT allowed), the MMP matched it to our click as the last click, and posted the install back to Freecash only.`
            : "The Play install referrer carried the MMP's click ID through the store, so the MMP credited our click and posted the install back to Freecash only.",
      };
    case 'organic':
      return bad('Organic install: nobody credited', organicDetail(ctx));
    case 'reinstall':
      return bad(
        'Reinstall: nobody credited',
        `The MMP has seen ${ctx.game} on this device before. A reinstall isn't a new user, so no source is credited and no postback is sent.`,
      );
    case 'rejected':
      return bad(
        "Rejected by the MMP's fraud tool",
        'The MMP told us the install was rejected; we record it and pay nothing.',
      );
    default:
      return bad(
        `Credited to another network (${result})`,
        `${result}'s click came after ours, and last click wins. The MMP posts back only to ${result}, so Freecash never hears about this install.`,
      );
  }
}

function organicDetail(ctx: {
  platform: Platform;
  attInOfferGame: boolean;
  game: string;
  lookbackDays: number;
}) {
  return ctx.platform === 'ios' && !ctx.attInOfferGame
    ? `${ctx.game} asked for tracking and Alex declined, so the MMP saw a zeroed IDFA and couldn't match our click. Only SKAdNetwork aggregates remain: no postback, no reward, no bill.`
    : `No matching click within the MMP's ${ctx.lookbackDays}-day lookback, so the install counts as organic: no postback.`;
}

/** Step 4's money line: what the install moved in the ledger, if we were credited. */
export function installMoneyLine(
  paid: { payout: Micros; reward: Micros } | null,
  advertiser: string,
  holdDays: number,
) {
  return paid
    ? `Money: ${advertiser} now owes us ${fmtUsd(paid.payout)} (receivable) and we owe Alex ${fmtUsd(paid.reward)}, on hold for ${holdDays} days. Same ledger transaction, so we never pay a reward we can't bill.`
    : 'Money: nothing billed, nothing rewarded. The impression we paid for is our only cost.';
}

/** What a goal the game reported came to, from the postback's point of view. */
export type GoalResult =
  | { kind: 'not_credited'; attributedTo: string }
  | { kind: 'paid'; payout: Micros; reward: Micros; boosted: boolean; boostMissed: boolean }
  | { kind: 'unpaid'; outcome: Outcome };

/** Step 5's note: who heard about the goal and what it paid. */
export function goalLines(
  result: GoalResult,
  f: { goal: Goal; advertiser: string; boostHours: number },
): Pick<Note, 'lines' | 'tone'> {
  switch (result.kind) {
    case 'not_credited':
      return {
        lines: [
          `The MMP posts back only to the source credited with the install (${result.attributedTo}). Freecash never hears about this goal.`,
        ],
        tone: 'warn',
      };
    case 'unpaid':
      return {
        lines: [
          `Postback received but not paid: ${result.outcome} (${OUTCOME_TEXT[result.outcome]}).`,
        ],
        tone: 'warn',
      };
    case 'paid':
      return { lines: paidGoalLines(result, f), tone: 'good' };
  }
}

function paidGoalLines(
  paid: Extract<GoalResult, { kind: 'paid' }>,
  f: { goal: Goal; advertiser: string; boostHours: number },
) {
  const bonus = paid.boosted
    ? ` (the linked-player bonus priced at Start, instead of ${fmtUsd(f.goal.reward)})`
    : '';
  const lines = [
    `${f.advertiser} owes us ${fmtUsd(paid.payout)} more; Alex gets ${fmtUsd(paid.reward)}${bonus}, on hold.`,
  ];
  if (paid.boostMissed)
    lines.push(`Reached after the ${f.boostHours} h bonus window, so the normal reward is paid.`);
  return lines;
}

/** Time travel's note when rewards were released. */
export function releaseLine(released: number, holdDays: number) {
  return released > 0
    ? `${released} reward${released > 1 ? 's' : ''} passed the ${holdDays}-day hold: moved from on-hold to cashable.`
    : `No reward has passed its ${holdDays}-day hold yet.`;
}
