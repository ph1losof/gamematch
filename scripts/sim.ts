/**
 * Simulates the live test end to end, in-process, over the real HTTP contracts: seeded users play
 * games, the network serves our ads to the treatment audience, some users click, start, install
 * and progress through real-shaped goal ladders; control users only find offers on their own.
 * Users the ad activated go on to start more offers (follow-on value), which the 90-day readout
 * counts. scripts/demo.ts prints one run; scripts/calibrate.ts runs the no-effect world many times.
 *
 * It is a mechanism check, not calibration evidence: WORLD is our own guess at how users really
 * behave, and it differs on purpose from the bidder's assumptions in config.ts, the way reality
 * will differ from our plan. Some users have intent: they click more AND would have started on
 * their own, which is what makes retargeting look better in attributed numbers than in the
 * experiment. Every random draw comes from one seeded RNG in a fixed order, so a seed always
 * replays the same run.
 */
import { treaty } from '@elysiajs/eden';
import { FREECASH_APP_IDS } from '../src/freecash/config';
import type { Goal } from '../src/freecash/offers';
import { getGoals } from '../src/freecash/offers';
import { GOALS, OFFER_LADDERS } from '../src/model/goals';
import { DEFAULT_PLATFORM_FEE, MEDIAN_CLEARING_CPM } from '../src/model/market';
import { SEGMENTS, type Segment, segmentFor, VALUE_TIERS } from '../src/model/segments';
import {
  addUser,
  LINKED_GAMES,
  OFFER_GAME,
  offerId,
  type SeedUser,
  STRATEGY_GAME,
  seedCatalog,
} from '../src/seed';
import { DAY, ManualClock } from '../src/shared/clock';
import { usd } from '../src/shared/money';
import { PLATFORMS, type Platform } from '../src/shared/types';
import { Device } from '../src/sim/device';
import { gameSdk } from '../src/sim/game';
import { createInProcessSystem, type System } from '../src/system';
import { generateUsers, seededRng } from './population';

export const AD_DAYS = 14;
/**
 * Our test plan decides at day 90: 14 days of ads + the 7-day click lookback + the deepest 60-day
 * goal close by day 81, and follow-on offers have time to count.
 */
export const READOUT_DAY = 90;

const OFFER_GAMES = [OFFER_GAME, STRATEGY_GAME];

const WORLD = {
  // About 4 sessions a day (GameAnalytics 2026 mobile benchmarks median,
  // https://gameanalytics.com/reports/2026-mobile-pc-gaming-benchmarks) × 1–2 full-screen ad
  // chances across the games a player opens. Our estimate.
  adRequestsPerActiveDay: 6,
  // Lapsed players open games less often, so they're in fewer auctions. They're also less likely to
  // have been about to try a second game anyway.
  segment: {
    hot: { activePerDay: 0.9, intentShare: 0.2 },
    warm: { activePerDay: 0.5, intentShare: 0.12 },
    cold: { activePerDay: 0.2, intentShare: 0.05 },
  } satisfies Record<Segment, { activePerDay: number; intentShare: number }>,
  /** market.ts's win curve: an exchange bid b wins maxShare × b^s / (median^s + b^s) of requests. */
  winCurve: { maxShare: 0.8, steepness: 2.5 },
  // Share of iOS users who allowed tracking in Freecash that also allow it in the game showing our
  // ad (Adjust Gaming App Insights 2026: 33–39% opt-in in gaming,
  // https://a.storyblok.com/f/47007/x/20551740ee/gaming-app-insights-report-2026.pdf).
  iosAttInPublisher: 0.35,
  iosAttInOfferGame: 0.45, // of iOS users who allowed ATT in Freecash, share who allow it in the offer game
  freecashAppInstalled: 0.5, // the rest only use the web, so ad clicks open the web landing page
  ctr: { intent: 0.06, other: 0.02 },
  startRate: { intent: 0.5, other: 0.25 },
  installRate: 0.6,
  competitorWins: 0.1, // installer later taps another network's ad for the same game
  organicStartPerDay: { intent: 0.004, other: 0.0002 }, // starts an offer from the offerwall unprompted (both arms)
  followOnStartPerDay: 0.006, // an activated user starting another offer, for followOnDays after their first install
  followOnDays: 60,
  lateGoalShare: 0.08, // reaches a goal just after its deadline
  // A goal is reached at this share of its deadline window (plus a random share of `spread`), or
  // `lateBy` × the deadline when late.
  goalTiming: { earliest: 0.2, spread: 0.7, lateBy: 1.1 },
};

/**
 * The CPM we'd have to pay to beat other bidders on one request, from a uniform draw `r`. The win
 * curve is in exchange bids; the mock network compares the CPM we pay, so the exchange price is
 * grossed up by the platform fee. The share above maxShare can't be won at any price.
 */
function clearingCpm(platform: Platform, r: number) {
  const { maxShare, steepness } = WORLD.winCurve;
  const unwinnable = 1 - maxShare;
  if (r < unwinnable) return Number.MAX_SAFE_INTEGER;
  const u = (r - unwinnable) / maxShare;
  return Math.round(
    (MEDIAN_CLEARING_CPM.us[platform] * (u / (1 - u)) ** (1 / steepness)) /
      (1 - DEFAULT_PLATFORM_FEE),
  );
}

export type SimOptions = {
  users: number;
  seed: number;
  /** A fixed CPM in dollars (the planned test: 15), or "value" for the value-based bid from config. */
  bid: number | 'value';
  ladder: 'median' | 'illustrative';
  /**
   * The no-effect world: no campaign runs, so no ad is served and nothing is spent, and both arms
   * behave the same. True incremental profit is exactly zero, the edge of the decision rule.
   */
  noEffect?: boolean;
};

type Person = SeedUser & {
  linkedApp: string;
  device: Device;
  segment: Segment;
  kind: 'intent' | 'other';
  started: Set<string>;
  activatedOn: number | null;
};
type OfferApp = { offerId: string; sdk: ReturnType<typeof gameSdk>; ladder: Goal[] };

/** One run's moving parts, shared by its steps. */
type Sim = {
  rng: () => number;
  sys: System;
  freecash: ReturnType<typeof treaty<System['freecash']>>;
  ads: ReturnType<typeof treaty<System['adNetworkMock']>>;
  /** Every offer by the app ID its store page shows, so an install reaches the right game SDK. */
  byAppId: Map<string, OfferApp>;
  /** Goal events due on a later day. */
  agenda: Map<number, (() => Promise<void>)[]>;
};

function must<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`simulation: no ${what}`);
  return value;
}

export async function simulate(opts: SimOptions) {
  const clock = new ManualClock();
  const fixedBid = opts.bid === 'value' ? {} : { android: usd(opts.bid), ios: usd(opts.bid) };
  const sys = createInProcessSystem({ clock, config: { fixedBidCpm: fixedBid } });
  await seedCatalog(sys.db, sys.urls, sys.fetch, {
    bubbleSaga: opts.ladder === 'illustrative' ? GOALS : OFFER_LADDERS.median,
  });
  const sim: Sim = {
    rng: seededRng(opts.seed),
    sys,
    freecash: treaty(sys.freecash),
    ads: treaty(sys.adNetworkMock),
    byAppId: offerApps(sys),
    agenda: new Map(),
  };
  const people = generateUsers(opts.users, sim.rng).map((u) => {
    addUser(sys.db, u, clock.now());
    return personFor(sim, u);
  });
  const enrolled = must((await sim.freecash.admin.experiment.enroll.post()).data, 'enrollment');
  const campaigns = opts.noEffect ? [] : await launchAll(sim);

  const t0 = performance.now();
  for (let day = 0; day < READOUT_DAY; day++) {
    if (day < AD_DAYS && !opts.noEffect) await adDay(sim, people, day);
    for (const person of people)
      if (sim.rng() < startChance(person, day)) await organicStart(sim, person, day);
    for (const due of sim.agenda.get(day) ?? []) await due();
    clock.advance(DAY);
  }
  await sim.freecash.admin.spend.sync.post();
  await sim.freecash.admin.rewards.release.post();

  return {
    sys,
    freecash: sim.freecash,
    people: people.length,
    enrolled,
    campaigns,
    seconds: (performance.now() - t0) / 1000,
    report: must((await sim.freecash.admin.experiment.get()).data, 'readout'),
  };
}

function offerApps(sys: System) {
  return new Map(
    OFFER_GAMES.flatMap((g) =>
      PLATFORMS.map((p): [string, OfferApp] => [
        g.appId[p],
        {
          offerId: offerId(p, g),
          sdk: gameSdk(sys.urls.mmp, sys.fetch, g.appId[p]),
          ladder: getGoals(sys.db, offerId(p, g)),
        },
      ]),
    ),
  );
}

/** A seeded user's phone and behaviour: where tracking is allowed, the Freecash app, and intent. */
function personFor(sim: Sim, u: SeedUser): Person {
  const { rng, sys } = sim;
  // The game they play, where our ads show.
  const linkedApp = must(
    LINKED_GAMES.find((g) => g.id === u.linkedGameId),
    `linked game ${u.linkedGameId}`,
  ).appId;
  const offerGameAtt = OFFER_GAMES.flatMap((g) =>
    rng() < WORLD.iosAttInOfferGame ? [g.appId.ios] : [],
  );
  const att =
    u.platform === 'ios' && u.trackingAllowed
      ? [
          FREECASH_APP_IDS.ios,
          ...(rng() < WORLD.iosAttInPublisher ? [linkedApp] : []),
          ...offerGameAtt,
        ]
      : [];
  const freecashApp =
    rng() < WORLD.freecashAppInstalled
      ? { host: new URL(sys.urls.freecash).host, userId: u.id }
      : undefined;
  const device = new Device(sys, {
    platform: u.platform,
    adId: u.deviceId,
    optedOut: !u.trackingAllowed,
    att,
    freecashApp,
  });
  const segment = segmentFor(u.daysSinceActive, sys.config.segmentDays);
  const kind = rng() < WORLD.segment[segment].intentShare ? 'intent' : 'other';
  return { ...u, linkedApp, device, segment, kind, started: new Set(), activatedOn: null };
}

/** One campaign per offer, platform, segment and value tier. */
async function launchAll(sim: Sim) {
  const campaigns = [];
  for (const p of PLATFORMS)
    for (const g of OFFER_GAMES)
      for (const segment of SEGMENTS)
        for (const valueTier of VALUE_TIERS) {
          const launched = await sim.freecash.admin.campaigns.post({
            offerId: offerId(p, g),
            segment,
            valueTier,
          });
          campaigns.push(must(launched.data, `campaign ${offerId(p, g)} ${segment} ${valueTier}`));
        }
  return campaigns;
}

/** A day of ads: audiences refreshed, every person's ad requests, then the daily spend sync. */
async function adDay(sim: Sim, people: Person[], day: number) {
  await sim.freecash.admin.audiences.refresh.post();
  // No shortcut for users who already started an offer: the system's audience sync drops them.
  for (const person of people) await seeAds(sim, person, day);
  // A daily spend sync, as production would run it: it is what pauses everything at the test budget.
  await sim.freecash.admin.spend.sync.post();
}

/** The person's ad requests today; the first ad they tap may lead to a start. */
async function seeAds(sim: Sim, person: Person, day: number) {
  const { rng } = sim;
  const requests =
    rng() < WORLD.segment[person.segment].activePerDay ? WORLD.adRequestsPerActiveDay : 0;
  for (let i = 0; i < requests; i++) {
    const served = await sim.ads.sim.serve.post({
      deviceId: person.device.adIdFor(person.linkedApp),
      publisherApp: person.linkedApp,
      // The mock has no rival bidders, so the floor stands in for them.
      floorCpm: clearingCpm(person.platform, rng()),
    });
    if (!served.data?.filled || rng() >= WORLD.ctr[person.kind]) continue;
    const click = await sim.ads.sim.click.post({ impressionId: served.data.impressionId });
    const landing = await person.device.open(must(click.data, 'click URL').url);
    if (rng() >= WORLD.startRate[person.kind]) return;
    const store = await person.device.open(`${landing.url}/start`, { method: 'POST' });
    await installAndPlay(sim, person, store.url, day);
    return;
  }
}

/** Activated users start follow-on offers for a while; others who never started may start unprompted. */
function startChance(person: Person, day: number) {
  if (person.activatedOn !== null && day - person.activatedOn <= WORLD.followOnDays)
    return WORLD.followOnStartPerDay;
  return person.started.size ? 0 : WORLD.organicStartPerDay[person.kind];
}

/** Today's offerwall, unprompted: the user picks an offer they haven't started. */
async function organicStart(sim: Sim, person: Person, day: number) {
  const options = OFFER_GAMES.flatMap((g) => {
    const id = offerId(person.platform, g);
    return person.started.has(id) ? [] : [id];
  });
  const pick = options[Math.floor(sim.rng() * options.length)];
  if (!pick) return;
  const res = await sim.sys.freecash.handle(
    new Request(`${sim.sys.urls.freecash}/offers/${pick}/start`, {
      method: 'POST',
      headers: { 'x-user-id': person.id },
    }),
  );
  const store = await person.device.open(must(res.headers.get('location'), 'tracking link'));
  await installAndPlay(sim, person, store.url, day);
}

/** The app ID a store URL shows: Google Play's `?id=`, or the App Store's last path segment. */
function appIdOf(storeUrl: string) {
  const url = new URL(storeUrl);
  return url.searchParams.get('id') ?? url.pathname.split('/').at(-1) ?? '';
}

/**
 * The user installs (or not), maybe through a competitor's later click, then works through the
 * ladder. No goal comes before its minDays ("play 7 days" takes 7 days), so a boost is only ever
 * earned where a real player could earn it.
 */
async function installAndPlay(sim: Sim, person: Person, storeUrl: string, day: number) {
  const { rng } = sim;
  const appId = appIdOf(storeUrl);
  const offer = must(sim.byAppId.get(appId), `offer for ${appId}`);
  person.started.add(offer.offerId);
  if (rng() >= WORLD.installRate) return;
  if (rng() < WORLD.competitorWins) {
    const adId = person.device.adIdFor(appId);
    const competitorClick = `${sim.sys.urls.mmp}/click/${appId}?pid=othernet&advertising_id=${adId}&idfa=${adId}`;
    storeUrl = (await person.device.open(competitorClick)).url;
  }
  const { installId } = await offer.sdk.install(person.device, storeUrl);
  person.activatedOn ??= day;
  scheduleGoals(sim, offer, installId, day);
}

/** Depth decides level goals and a separate draw purchases; each reached goal is put on the agenda. */
function scheduleGoals(sim: Sim, offer: OfferApp, installId: string, day: number) {
  const { rng } = sim;
  const depth = rng();
  const spend = rng();
  for (const g of offer.ladder) {
    if (g.event === 'install' || (g.requiresPurchase ? spend : depth) >= g.completionRate) continue;
    const { earliest, spread, lateBy } = WORLD.goalTiming;
    const late = rng() < WORLD.lateGoalShare;
    const share = late ? lateBy : earliest + spread * rng();
    const dueDay = day + Math.max(g.minDays, Math.ceil(g.deadlineDays * share));
    const due = sim.agenda.get(dueDay) ?? [];
    due.push(async () => {
      await offer.sdk.track(installId, g.event);
    });
    sim.agenda.set(dueDay, due);
  }
}
