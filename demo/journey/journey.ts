/**
 * One user's journey through GameMatch, step by step, on one in-process System with a manual clock
 * (world.ts builds it). Each step makes the real requests between the parties, which the timeline
 * records as hops (hops.ts says what each means), writes a note (notes.ts) and sets what the phone
 * shows. state() reads the panels (views.ts) after every step. No UI here: server.ts serves it over
 * HTTP and test/journey drives it directly.
 *
 * Demo shortcuts, on purpose (also listed on the page, see SHORTCUTS):
 *  - holdout 0%, so the one demo user is always in treatment;
 *  - ad floor $0, so our bid always wins;
 *  - spend is synced right after the impression, not by a periodic job;
 *  - the competitor's click URL is built by hand, with no second ad network behind it;
 *  - Start posts to `${landingUrl}/start`, which equals the landing page's form action.
 */
import { desc, eq } from 'drizzle-orm';
import { getAdClick } from '../../src/freecash/clicks';
import { loadLanding } from '../../src/freecash/landing';
import { balances } from '../../src/freecash/ledger';
import { type Goal, getGoals } from '../../src/freecash/offers';
import { hasGoals, type Ladder } from '../../src/freecash/personalise';
import { conversions, experimentMembers } from '../../src/freecash/schema';
import { goalState } from '../../src/freecash/screens';
import { adIdParam, CLICK_LOOKBACK } from '../../src/mocks/mmp';
import { offerId } from '../../src/seed';
import { ZERO_AD_ID } from '../../src/shared/adid';
import { DAY, HOUR, ManualClock } from '../../src/shared/clock';
import { fmtUsd, type Micros } from '../../src/shared/money';
import type { Creative } from '../../src/shared/types';
import type { Hop } from '../../src/system';
import { describeHop, storeVisit } from './hops';
import {
  adShownLines,
  dayCount,
  describeAttribution,
  type GoalResult,
  goalLines,
  installMoneyLine,
  landingLines,
  noAdReasons,
  openGameLines,
  releaseLine,
  startLines,
} from './notes';
import { DEFAULT_PERSONA, type Persona, SEGMENT_DAYS } from './persona';
import { Timeline } from './timeline';
import type { Attribution, JourneyState, Note, Rules, Screen, StepView } from './types';
import {
  campaignName,
  getStartRow,
  goalViews,
  lastPostback,
  ledgerView,
  networkView,
  postbackFacts,
} from './views';
import {
  createWorld,
  installBefore,
  OFFER_GAMES,
  type OfferGame,
  sdkOf,
  seedWorld,
  type World,
} from './world';

export type { JourneyState, Persona };

/** A step run out of order, or after the journey was blocked. server.ts maps it to 409. */
export class JourneyError extends Error {}

const SHORTCUTS = [
  'Holdout 0%: every eligible user is in treatment, so the demo user always gets the ad.',
  'Ad floor $0: the ad request sets no floor, so our bid always wins the auction.',
  "Spend is synced right after the impression; in production a periodic job reads the network's report.",
  "The competitor's click URL is built by hand (pid=othernet); there is no second ad network.",
  "Tap Start posts to the landing URL + /start, which equals the page's form action; the demo doesn't parse the form.",
];

/** When the demo's clock starts: an evening, when people play. Our design choice. */
const JOURNEY_START = Date.UTC(2026, 9, 1, 18, 30);
/** How long Alex takes between actions, so the timeline reads like a real session. Our design choice. */
const SEE_AD_TO_TAP = 3_000;
const READ_PAGE_TO_START = 20_000;
const STORE_TO_FIRST_OPEN = 2 * 60_000;
const START_TO_COMPETITOR_AD = HOUR;
/** One play session: the least time any goal takes. Our design choice. */
const PLAY_SESSION = 3 * HOUR;

/** The offer step 1's audience plan picked for Alex. */
type Match = { game: OfferGame; offerId: string; campaignId: string; ladder: Ladder<Goal> };
type Start = { id: string; storeUrl: string };
type Conversion = typeof conversions.$inferSelect;

/** How far the journey got. Each step needs the one before, and each stage carries what it left. */
type Reached =
  | { step: 0 }
  | { step: 1; match: Match; impressionId: string }
  | { step: 2; match: Match; landingUrl: string }
  | { step: 3; match: Match; start: Start }
  | { step: 4; match: Match; start: Start; installId: string; attribution: Attribution };

const isAt = <N extends Reached['step']>(r: Reached, n: N): r is Extract<Reached, { step: N }> =>
  r.step === n;

export class Journey {
  readonly persona: Persona;
  readonly world: World;
  private readonly clock = new ManualClock(JOURNEY_START);
  private readonly timeline: Timeline;
  private reached: Reached = { step: 0 };
  /** Why the journey can't go on, and the step that found out. */
  private blocked: { after: number; reason: string } | null = null;
  /** The offer the audience plan picked, kept even when no ad could be shown. */
  private matched: Match | null = null;
  /** Audience size per campaign, from the last refresh. */
  private audience = new Map<string, number>();
  private screens: Screen[] = [{ kind: 'home' }];
  private notes: Note[] = [];
  /** Goal events the game has reported, credited or not. */
  private readonly played = new Set<string>();

  private constructor(persona: Persona) {
    this.persona = persona;
    this.timeline = new Timeline((hop) => this.hopText(hop), this.clock);
    this.world = createWorld(persona, this.clock, this.timeline);
  }

  static async create(persona: Partial<Persona> = {}): Promise<Journey> {
    const journey = new Journey({ ...DEFAULT_PERSONA, ...persona });
    await seedWorld(journey.world, journey.timeline);
    if (journey.persona.reinstall) await journey.installBefore();
    return journey;
  }

  // ---------------------------------------------------------------- step 1

  /** 1. Campaigns go live, the user opens the linked game and its ad SDK asks the network for an ad. */
  async openGame() {
    this.expect(0);
    const { linked } = this.world;
    this.timeline.group = `1 · Opens ${linked.name}`;
    await this.enroll();
    this.matched = await this.refreshAudiences(await this.launchCampaigns());
    const lines = openGameLines({
      segment: this.persona.segment,
      platform: this.persona.platform,
      segmentDays: SEGMENT_DAYS[this.persona.segment],
      linked,
      matched: this.matched?.game ?? null,
    });
    const { served, zeroedAdId } = await this.requestAd();
    if (served.filled && this.matched)
      await this.showAd(this.matched, served.impressionId, served.creative, lines);
    else this.showNoAd(zeroedAdId, lines);
    return this.state();
  }

  private async enroll() {
    const arms = await ok(this.world.freecash.admin.experiment.enroll.post(), 'enroll');
    this.timeline.annotate(
      `treatment ${arms.treatment}, control ${arms.control} (demo shortcut: holdout 0%)`,
    );
  }

  /** One campaign per offer game, for Alex's platform and segment. */
  private async launchCampaigns() {
    const { platform, segment } = this.persona;
    const launched: { game: OfferGame; campaignId: string }[] = [];
    for (const game of OFFER_GAMES) {
      const campaign = await ok(
        this.world.freecash.admin.campaigns.post({
          offerId: offerId(platform, game),
          segment,
          valueTier: 'standard',
        }),
        'launch',
      );
      this.timeline.annotate(
        `${game.name} (${game.genre}) · ${platform} · ${segment} · bid ${fmtUsd(campaign.bidCpm)} CPM · audience ${campaign.audienceSize}`,
      );
      launched.push({ game, campaignId: campaign.id });
    }
    return launched;
  }

  /** Puts each user in their best-fit campaign; Alex's is the one with an audience. */
  private async refreshAudiences(launched: { game: OfferGame; campaignId: string }[]) {
    const sizes = await ok(this.world.freecash.admin.audiences.refresh.post(), 'refresh');
    this.audience = new Map(Object.entries(sizes));
    const { db } = this.world.sys;
    this.timeline.annotate(
      launched.map((c) => `${campaignName(db, c.campaignId)}: ${sizes[c.campaignId]}`).join(' · '),
    );
    const pick = launched.find((c) => (sizes[c.campaignId] ?? 0) > 0);
    if (!pick) return null;
    const id = offerId(this.persona.platform, pick.game);
    const ladder = getGoals(db, id);
    if (!hasGoals(ladder)) throw new Error(`offer ${id} has no goals`);
    return { ...pick, offerId: id, ladder };
  }

  /** The linked game's ad SDK asks the network for an ad with the ad ID it can read. */
  private async requestAd() {
    const { device, linked, adNetwork } = this.world;
    const adId = device.adIdFor(linked.appId);
    const zeroedAdId = adId === ZERO_AD_ID;
    const served = await ok(
      adNetwork.sim.serve.post({ deviceId: adId, publisherApp: linked.appId, floorCpm: 0 }),
      'ad request',
    );
    this.timeline.annotate(
      served.filled
        ? `filled: ${served.creative.headline}`
        : `no fill (ad ID ${zeroedAdId ? 'zeroed' : 'not in any audience'})`,
    );
    return { served, zeroedAdId };
  }

  private async showAd(match: Match, impressionId: string, creative: Creative, lines: string[]) {
    const { freecash, linked } = this.world;
    await ok(freecash.admin.spend.sync.post(), 'spend sync');
    this.timeline.annotate(
      'impression cost booked: ad spend / owed to the network (demo shortcut: synced right away)',
    );
    await ok(freecash.admin.campaigns({ id: match.campaignId }).get(), 'campaign report');
    this.timeline.annotate('impressions, spend and network conversions for the matched campaign');
    const { segment } = this.persona;
    this.screens = [
      { kind: 'game-ad', creative, offerGame: match.game.name, genre: match.game.genre, segment },
    ];
    const shown = adShownLines({
      publisher: linked.name,
      game: match.game.name,
      segment,
      headline: creative.headline,
    });
    this.note(`${linked.name} shows our ad`, [...lines, ...shown], 'good');
    this.reached = { step: 1, match, impressionId };
  }

  private showNoAd(zeroedAdId: boolean, lines: string[]) {
    const { sys, user, linked } = this.world;
    const member = sys.db
      .select()
      .from(experimentMembers)
      .where(eq(experimentMembers.userId, user.id))
      .get();
    const reasons = noAdReasons({
      platform: this.persona.platform,
      publisher: linked.name,
      zeroedAdId,
      arm: member?.arm ?? null,
      matched: this.matched !== null,
    });
    this.screens = [{ kind: 'game-noad', reasons }];
    this.blocked = { after: 1, reason: `No ad served: ${reasons[0]}` };
    this.note('No ad served', [...lines, ...reasons], 'bad');
  }

  // ---------------------------------------------------------------- steps 2 and 3

  /** 2. The tap: the network fills the click URL, which goes through Freecash's MMP to /go and the landing page. */
  async tapAd() {
    const at = this.expect(1);
    this.timeline.group = '2 · Tap the ad';
    this.clock.advance(SEE_AD_TO_TAP);
    const click = await ok(
      this.world.adNetwork.sim.click.post({ impressionId: at.impressionId }),
      'ad click',
    );
    this.timeline.annotate(
      'click URL = Freecash MMP re-engagement link with the ad ID and impression ID filled in',
    );
    const landing = await this.world.device.open(click.url);
    this.screens = [this.webScreen(landing, 'Offer')];
    this.note(
      'Landing page, personalised',
      landingLines(this.persona.inApp, this.landingView(landing.url)),
      'info',
    );
    this.reached = { step: 2, match: at.match, landingUrl: landing.url };
    return this.state();
  }

  /** What the landing page at `url` showed, loaded the way Freecash rendered it. */
  private landingView(url: string) {
    const { sys } = this.world;
    const click = getAdClick(sys.db, lastSegment(url));
    const view = click && loadLanding(sys, click);
    if (!view) throw new Error(`no landing page at ${url}`);
    return view;
  }

  /** 3. Start (form POST): click ID minted, "opening the store", the advertiser's tracking link, the store. */
  async tapStart() {
    const at = this.expect(2);
    this.timeline.group = '3 · Tap Start';
    this.clock.advance(READ_PAGE_TO_START);
    const { device, pages } = this.world;
    const seen = pages.length;
    // Demo shortcut: the landing page's form action, without parsing the form.
    const visit = await device.open(`${at.landingUrl}/start`, { method: 'POST' });
    const verifying = pages.slice(seen).find((p) => new URL(p.url).pathname.startsWith('/s/'));
    if (!visit.external || !verifying) return this.startRefused(visit);
    const start = { id: lastSegment(verifying.url), storeUrl: visit.url };
    this.timeline.push(storeVisit(visit.url, this.persona.platform));
    this.screens = [
      // Without its meta refresh, so the phone shows the page instead of following it.
      this.webScreen(
        { url: verifying.url, html: stripRefresh(verifying.html) },
        'Opening the store',
      ),
      this.storeScreen(at.match, visit.url),
    ];
    const advertiser = at.match.game.advertiser.name;
    this.note(
      'Offer started, on to the store',
      startLines({ clickId: start.id, advertiser, storeUrl: visit.url }),
      'info',
    );
    this.reached = { step: 3, match: at.match, start };
    return this.state();
  }

  private startRefused(visit: { url: string; html: string; status: number }) {
    this.screens = [this.webScreen(visit, 'Freecash')];
    this.blocked = {
      after: 3,
      reason: `Start was refused: Freecash answered HTTP ${visit.status}.`,
    };
    this.note(
      'Start refused',
      [
        `${new URL(visit.url).pathname} answered ${visit.status}, so no click ID was minted and the advertiser's MMP heard nothing.`,
      ],
      'bad',
    );
    return this.state();
  }

  // ---------------------------------------------------------------- steps 4 and 5

  /** 4. The game's SDK reports the first open; the advertiser's MMP decides attribution and posts back to the winner. */
  async install() {
    const at = this.expect(3);
    this.timeline.group = '4 · Install & open';
    const { game } = at.match;
    const detour = this.persona.competitor ? await this.competitorDetour(at.match) : null;
    this.clock.advance(STORE_TO_FIRST_OPEN);
    const storeUrl = detour?.storeUrl ?? at.start.storeUrl;
    const { result, paid } = await this.paidBy(() =>
      sdkOf(this.world, game).install(this.world.device, storeUrl),
    );
    this.played.add('install');
    this.timeline.annotate(`attribution: ${result.attribution}`);
    const attribution = describeAttribution(result.attribution, {
      platform: this.persona.platform,
      attInOfferGame: this.persona.attInOfferGame,
      game: game.name,
      lookbackDays: this.rules().lookbackDays,
    });
    this.screens = [...(detour?.screens ?? []), this.firstOpenScreen(at.match, paid)];
    const money = installMoneyLine(paid, game.advertiser.name, this.rules().holdDays);
    const lines = [...(detour?.lines ?? []), attribution.detail, money];
    this.note(attribution.title, lines, attribution.tone);
    this.reached = { ...at, step: 4, installId: result.installId, attribution };
    return this.state();
  }

  /** An hour after Start, in another app, Alex taps another network's ad for the same game. */
  private async competitorDetour(match: Match) {
    const { sys, device } = this.world;
    const appId = match.game.appId[device.platform];
    this.clock.advance(START_TO_COMPETITOR_AD);
    // Demo shortcut: the competitor's click URL is built by hand; no second ad network serves it.
    const visit = await device.open(
      `${sys.urls.mmp}/click/${appId}?pid=othernet&clickid=othernet_7731&${adIdParam(device.platform)}=${device.adIdFor(appId)}`,
    );
    this.timeline.push(storeVisit(visit.url, device.platform));
    const screens: Screen[] = [
      {
        kind: 'other-ad',
        publisher: 'Puzzle Blast',
        network: 'OtherNet',
        offerGame: match.game.name,
        genre: match.game.genre,
      },
      this.storeScreen(match, visit.url),
    ];
    const lines = [
      "An hour later, in another app, Alex taps a competitor network's ad for the same game and installs from that store visit.",
    ];
    return { storeUrl: visit.url, screens, lines };
  }

  /** 5. Alex reaches a goal in the game; the SDK reports it and the MMP posts back if we were credited. */
  async play(event?: string) {
    const at = this.expect(4);
    const goal = this.goalToPlay(at.match.ladder, event);
    const { game } = at.match;
    this.timeline.group = `5 · Play: ${goal.label}`;
    this.clock.advance(this.timeToReach(goal, at.start.id));
    const { result, paid } = await this.paidBy(() =>
      sdkOf(this.world, game).track(at.installId, goal.event),
    );
    this.played.add(goal.event);
    this.timeline.annotate(
      `event: ${goal.event}${result.postbackSent ? '' : " · no postback (we weren't credited)"}`,
    );
    const { lines, tone } = goalLines(this.goalResult(at, goal, result.postbackSent, paid), {
      goal,
      advertiser: game.advertiser.name,
      boostHours: this.rules().boostHours,
    });
    this.screens = [
      {
        kind: 'game',
        game: game.name,
        title: 'Goal reached',
        sub: goal.label,
        att: null,
        notification: paid && this.notification(paid.reward, `${game.name}: ${goal.label}.`),
      },
    ];
    this.note(`Goal: ${goal.label}`, lines, tone);
    return this.state();
  }

  /** The goal asked for, or the next one in the ladder. */
  private goalToPlay(ladder: Ladder<Goal>, event: string | undefined) {
    const goal =
      event === undefined ? nextGoal(ladder, this.played) : ladder.find((g) => g.event === event);
    if (goal) return goal;
    throw new JourneyError(
      event === undefined ? 'every goal has been played' : `unknown goal ${event}`,
    );
  }

  /** A play session, or longer if the goal can't come sooner ("play 7 days" takes 7 days from the install). */
  private timeToReach(goal: Goal, startId: string) {
    const installedAt = getStartRow(this.world.sys.db, startId)?.installedAt ?? null;
    const earliest = installedAt === null ? 0 : installedAt + goal.minDays * DAY;
    return Math.max(PLAY_SESSION, earliest - this.clock.now());
  }

  /** What the goal came to: not heard of, paid (boosted or not), or recorded and refused. */
  private goalResult(
    at: Extract<Reached, { step: 4 }>,
    goal: Goal,
    postbackSent: boolean,
    paid: Conversion | null,
  ): GoalResult {
    const { db } = this.world.sys;
    if (!postbackSent) return { kind: 'not_credited', attributedTo: at.attribution.result };
    if (!paid)
      return {
        kind: 'unpaid',
        outcome: lastPostback(db, at.start.id, goal.event)?.outcome ?? 'duplicate',
      };
    // The boost was priced once, at Start, and stored on the start row.
    const boostedGoal = getStartRow(db, at.start.id)?.boostEvent === goal.event;
    const boosted = paid.reward > goal.reward;
    return {
      kind: 'paid',
      payout: paid.payout,
      reward: paid.reward,
      boosted,
      boostMissed: boostedGoal && !boosted,
    };
  }

  // ---------------------------------------------------------------- time and back office

  /** Moves the clock; with `release`, runs the reward release afterwards. Says which windows closed on the way. */
  async advance(days: number, release: boolean) {
    this.timeline.group = `Time · +${dayCount(days)}`;
    const was = this.clock.now();
    this.clock.advance(days * DAY);
    const lines = [
      `Now day ${this.day().toFixed(1)} of the journey.`,
      ...this.windowsClosedSince(was),
    ];
    if (release) lines.push(await this.releaseRewards());
    this.note(release ? 'Hold over, rewards released' : `+${dayCount(days)}`, lines, 'info');
    return this.state();
  }

  /** The bonus window and the click lookback, if either closed since `was`, then goal deadlines. */
  private windowsClosedSince(was: number) {
    const r = this.reached;
    const start = 'start' in r ? getStartRow(this.world.sys.db, r.start.id) : undefined;
    if (!start) return [];
    const { boostHours, lookbackDays } = this.rules();
    const closed = (deadline: number | null) =>
      deadline !== null && was <= deadline && this.clock.now() > deadline;
    const lines = [];
    if (closed(start.boostUntil))
      lines.push(
        `The ${boostHours} h linked-player bonus has expired: the lead goal now pays its normal reward.`,
      );
    if (r.step === 3 && closed(start.createdAt + CLICK_LOOKBACK))
      lines.push(
        `Past the MMP's ${lookbackDays}-day click lookback: an install now would be organic.`,
      );
    return [...lines, ...this.deadlinesPassedSince(was, start)];
  }

  /** Goals not played yet whose deadline passed since `was`, by the progress page's own rule. */
  private deadlinesPassedSince(
    was: number,
    start: { offerId: string; createdAt: number; installedAt: number | null },
  ) {
    const { holdDays } = this.rules();
    const expired = (g: Goal, at: number) =>
      goalState(g, undefined, start, at, holdDays).kind === 'expired';
    return getGoals(this.world.sys.db, start.offerId).flatMap((g) =>
      !this.played.has(g.event) && !expired(g, was) && expired(g, this.clock.now())
        ? [`Deadline passed for "${g.label}" (${dayCount(g.deadlineDays)}).`]
        : [],
    );
  }

  private async releaseRewards() {
    const r = await ok(this.world.freecash.admin.rewards.release.post(), 'release');
    this.timeline.annotate(`${r.released} released`);
    return releaseLine(r.released, this.rules().holdDays);
  }

  /** Re-reads the network's report and books any new spend. */
  async syncSpend() {
    this.timeline.group = 'Back office · spend sync';
    const booked = await ok(this.world.freecash.admin.spend.sync.post(), 'spend sync');
    const total = Object.values(booked).reduce((s, v) => s + v, 0);
    this.timeline.annotate(total ? `booked ${fmtMicros(total)}` : 'nothing new to book');
    this.note(
      'Spend synced',
      [
        total
          ? `Booked ${fmtMicros(total)} of new ad spend.`
          : "The network's cumulative report hasn't grown, so nothing is booked.",
      ],
      'info',
    );
    return this.state();
  }

  /** The real progress page for this start, as the phone would load it. */
  async progressPage(): Promise<Screen> {
    const r = this.reached;
    if (!('start' in r)) throw new JourneyError('no offer started yet');
    this.timeline.group = 'Phone · progress page';
    const visit = await this.world.device.open(`${this.world.sys.urls.freecash}/p/${r.start.id}`);
    return this.webScreen(visit, 'Your progress');
  }

  // ---------------------------------------------------------------- state

  async state(): Promise<JourneyState> {
    const { sys, linked, user } = this.world;
    const r = this.reached;
    return {
      persona: this.persona,
      linkedGame: { name: linked.name, genre: linked.genre },
      rules: this.rules(),
      shortcuts: SHORTCUTS,
      now: this.clock.now(),
      day: this.day(),
      steps: this.stepViews(),
      blocked: this.blocked?.reason ?? null,
      screens: this.screens,
      startId: 'start' in r ? r.start.id : null,
      matched: this.matchedView(),
      attribution: 'attribution' in r ? r.attribution : null,
      timeline: this.timeline.entries,
      ledger: ledgerView(sys.db, balances(sys.db), firstName(user.name)),
      network: await this.timeline.quietly(() =>
        networkView(sys, this.audience, this.matched?.campaignId ?? null),
      ),
      goals: this.goalViews(),
      notes: this.notes,
    };
  }

  private matchedView(): JourneyState['matched'] {
    const m = this.matched;
    if (!m) return null;
    return { offerId: m.offerId, game: m.game.name, genre: m.game.genre, campaignId: m.campaignId };
  }

  private goalViews() {
    if (!this.matched) return [];
    const r = this.reached;
    return goalViews(this.world.sys, {
      offerId: this.matched.offerId,
      userId: this.world.user.id,
      startId: 'start' in r ? r.start.id : null,
      played: this.played,
    });
  }

  /** The windows the labels quote, from the System's own config and the MMP mock. */
  private rules(): Rules {
    const { rewardHoldDays, linkedBoost } = this.world.sys.config;
    return {
      holdDays: rewardHoldDays,
      boostHours: linkedBoost.hours,
      lookbackDays: CLICK_LOOKBACK / DAY,
    };
  }

  private day() {
    return (this.clock.now() - JOURNEY_START) / DAY;
  }

  private stepViews(): StepView[] {
    const next = this.matched ? nextGoal(this.matched.ladder, this.played) : undefined;
    const titles = [
      `Player opens ${this.world.linked.name}`,
      'Tap the ad',
      'Tap Start',
      'Install & open',
      next ? `Play: ${next.label}` : 'Play: every goal reached',
    ];
    const done = Math.max(this.reached.step, this.blocked?.after ?? 0);
    return titles.map((title, i) => ({
      n: i + 1,
      title,
      status: i < 4 ? this.stepStatus(i + 1, done) : this.playStatus(done, next !== undefined),
    }));
  }

  /** Steps 1–4 run once each, in order. */
  private stepStatus(n: number, done: number): StepView['status'] {
    if (n <= done) return 'done';
    if (this.blocked) return 'blocked';
    return n === done + 1 ? 'next' : 'locked';
  }

  /** Step 5 repeats after the install, until every goal is played. */
  private playStatus(done: number, goalsLeft: boolean): StepView['status'] {
    if (done < 4) return this.blocked ? 'blocked' : 'locked';
    return goalsLeft ? 'next' : 'done';
  }

  // ---------------------------------------------------------------- helpers

  /** The journey right after step `n`, or why the next step can't run. */
  private expect<N extends Reached['step']>(n: N): Extract<Reached, { step: N }> {
    const r = this.reached;
    if (this.blocked) throw new JourneyError(this.blocked.reason);
    if (isAt(r, n)) return r;
    throw new JourneyError(
      r.step > n ? `step ${n + 1} is done; reset to replay` : `do step ${r.step + 1} first`,
    );
  }

  private note(title: string, lines: string[], tone: Note['tone']) {
    this.notes.push({ group: this.timeline.group, title, lines, tone });
  }

  private hopText(hop: Hop) {
    const { sys, linked } = this.world;
    const ctx = {
      urls: sys.urls,
      inApp: this.persona.inApp,
      publisher: linked.name,
      offerGame: this.matched?.game.name ?? null,
    };
    return describeHop(hop, ctx, postbackFacts(sys, hop.url));
  }

  private webScreen(page: { url: string; html: string }, title: string): Screen {
    return { kind: 'web', url: page.url, html: page.html, title, inApp: this.persona.inApp };
  }

  private storeScreen(match: Match, url: string): Screen {
    const { game, ladder } = match;
    const { platform } = this.persona;
    const last = ladder.at(-1) ?? ladder[0];
    return {
      kind: 'store',
      platform,
      game: game.name,
      genre: game.genre,
      developer: game.advertiser.name,
      appId: game.appId[platform],
      url,
      about: `${ladder.length} rewarded goals on Freecash, from "${ladder[0].label}" to "${last.label}".`,
    };
  }

  /** The offer game's first open, with the ATT prompt on iOS and our reward if we were credited. */
  private firstOpenScreen(match: Match, paid: Conversion | null): Screen {
    const { name } = match.game;
    const installGoal = match.ladder.find((g) => g.event === 'install');
    return {
      kind: 'game',
      game: name,
      title: `Welcome to ${name}`,
      sub: installGoal ? `Done: ${installGoal.label}` : 'First open',
      att: this.attChoice(),
      notification: paid && this.notification(paid.reward, `${name} install confirmed.`),
    };
  }

  /** What Alex answered to the offer game's ATT prompt; Android has none. */
  private attChoice() {
    if (this.persona.platform === 'android') return null;
    return this.persona.attInOfferGame ? 'allowed' : 'denied';
  }

  private notification(reward: Micros, body: string) {
    return {
      title: `+${fmtUsd(reward)} on hold`,
      body: `${body} Cashable after the ${this.rules().holdDays}-day hold.`,
    };
  }

  /** Runs a game SDK report and returns its result and the conversion it paid, if any. */
  private async paidBy<T>(report: () => Promise<T>) {
    const before = this.latestConversion()?.id;
    const result = await report();
    const latest = this.latestConversion();
    return { result, paid: latest !== undefined && latest.id !== before ? latest : null };
  }

  private latestConversion() {
    return this.world.sys.db
      .select()
      .from(conversions)
      .where(eq(conversions.userId, this.world.user.id))
      .orderBy(desc(conversions.createdAt))
      .get();
  }

  /** "Already had the game": the offer game step 1 will pick was installed before the demo. */
  private async installBefore() {
    this.timeline.group = 'Before the demo';
    const game = await installBefore(this.world);
    this.timeline.annotate(
      `Alex played ${game.name} last year (organic install); the MMP remembers the device`,
    );
    this.note(
      `Alex had ${game.name} before`,
      ["Installed organically last year, so the advertiser's MMP already knows this device."],
      'info',
    );
  }
}

/** The body of a call the demo needs to succeed; anything else is a bug in the demo. */
async function ok<T>(call: Promise<{ data: T | null }>, what: string): Promise<T> {
  const { data } = await call;
  if (data === null) throw new Error(`${what} failed`);
  return data;
}

/** The next goal to play: the first one left that needs no purchase, else the first one left. */
function nextGoal(ladder: Goal[], played: Set<string>) {
  const left = ladder.filter((g) => g.event !== 'install' && !played.has(g.event));
  return left.find((g) => !g.requiresPurchase) ?? left[0];
}

/** The ID at the end of a path like /l/:adClickId or /s/:startId. */
const lastSegment = (url: string) => {
  const path = new URL(url).pathname;
  return path.slice(path.lastIndexOf('/') + 1);
};
const firstName = (name: string) => name.split(' ')[0] ?? name;
const stripRefresh = (html: string) => html.replace(/<meta http-equiv="refresh"[^>]*>/i, '');
/** Micro-dollars with enough decimals for sub-cent amounts like one impression. */
const fmtMicros = (m: Micros) => `$${(m / 1e6).toFixed(m % 10_000 === 0 ? 2 : 4)}`;
