/**
 * Audiences are planned once for all campaigns: each targetable device of a treatment user who
 * hasn't started an offer goes into exactly one campaign, the one for their best-fit offer
 * (personalise.ts) in their segment, tier and platform. So our campaigns never bid against each
 * other, and a user who starts any offer, withdraws consent or stops qualifying drops out on the
 * next sync, so we stop paying to reach them.
 * They stay in their arm, and in the readout, because the comparison is intent-to-treat: dropping
 * them from treatment only would leave the arms unlike.
 */
import { and, asc, eq, inArray, notExists } from 'drizzle-orm';
import type { Segment, ValueTier } from '../model/segments';
import type { Platform } from '../shared/types';
import type { Config } from './config';
import type { DbOrTx } from './db';
import type { Deps } from './deps';
import { mayTarget, targetableDevice } from './eligibility';
import { bestOffer, biddingLadder, type OfferOption, type UserLinks } from './personalise';
import {
  campaigns,
  devices,
  experimentMembers,
  type Goal,
  games,
  goals,
  links,
  offerStarts,
  offers,
  users,
} from './schema';

type Stratum = { segment: Segment; valueTier: ValueTier; platform: Platform };
type Member = Stratum & { userId: string; deviceId: string };
type CampaignOption = Stratum & OfferOption & { campaignId: string };
type AudienceInputs = {
  members: Member[];
  links: Map<string, UserLinks>;
  campaigns: CampaignOption[];
};

const NO_LINKS: UserLinks = { gameIds: new Set(), genres: new Set() };
const stratumKey = (s: Stratum) => `${s.segment}:${s.valueTier}:${s.platform}`;

/** Replaces every campaign's audience at the network with the current plan. Returns sizes by campaign. */
export async function syncAudiences({
  db,
  config,
  adNetwork,
}: Pick<Deps, 'db' | 'config' | 'adNetwork'>) {
  const plan = planAudiences(loadAudienceInputs(db, config), config.genreMatchMultiplier);
  const sizes: Record<string, number> = {};
  for (const c of db.select().from(campaigns).all()) {
    const deviceIds = plan.get(c.id) ?? [];
    await adNetwork.replaceAudience(c.networkAudienceId, deviceIds);
    sizes[c.id] = deviceIds.length;
  }
  return sizes;
}

/** Device IDs per campaign: each member's device goes to the campaign for their best-fit offer. Pure. */
function planAudiences(inputs: AudienceInputs, genreMatchMultiplier: number) {
  const competing = Map.groupBy(inputs.campaigns, stratumKey);
  const plan = new Map<string, string[]>();
  for (const m of inputs.members) {
    const choices = competing.get(stratumKey(m)) ?? [];
    const offerId = bestOffer(
      inputs.links.get(m.userId) ?? NO_LINKS,
      choices,
      genreMatchMultiplier,
    );
    const campaign = choices.find((c) => c.offerId === offerId);
    if (!campaign) continue;
    const audience = plan.get(campaign.campaignId) ?? [];
    audience.push(m.deviceId);
    plan.set(campaign.campaignId, audience);
  }
  return plan;
}

/** What the planner reads: who may be targeted now, what they play, and the campaigns as offer options. */
function loadAudienceInputs(db: DbOrTx, config: Config): AudienceInputs {
  return {
    members: targetableMembers(db, config),
    links: linksOfTreatment(db),
    campaigns: campaignOptions(db, config),
  };
}

/** Treatment members with a targetable device who never started an offer; eligibility rechecked now. */
const targetableMembers = (db: DbOrTx, config: Config): Member[] =>
  db
    .select({
      userId: experimentMembers.userId,
      segment: experimentMembers.segment,
      valueTier: experimentMembers.valueTier,
      platform: devices.platform,
      deviceId: devices.deviceId,
    })
    .from(experimentMembers)
    .innerJoin(users, eq(users.id, experimentMembers.userId))
    .innerJoin(devices, eq(devices.userId, experimentMembers.userId))
    .where(
      and(
        eq(experimentMembers.arm, 'treatment'),
        mayTarget(config),
        targetableDevice(config),
        notExists(
          db.select().from(offerStarts).where(eq(offerStarts.userId, experimentMembers.userId)),
        ),
      ),
    )
    .all();

function linksOfTreatment(db: DbOrTx) {
  const treatment = db
    .select({ id: experimentMembers.userId })
    .from(experimentMembers)
    .where(eq(experimentMembers.arm, 'treatment'));
  const byUser = new Map<string, UserLinks>();
  for (const l of db
    .select({ userId: links.userId, gameId: links.gameId, genre: games.genre })
    .from(links)
    .innerJoin(games, eq(games.id, links.gameId))
    .where(inArray(links.userId, treatment))
    .all()) {
    const u = byUser.get(l.userId) ?? { gameIds: new Set(), genres: new Set() };
    u.gameIds.add(l.gameId);
    u.genres.add(l.genre);
    byUser.set(l.userId, u);
  }
  return byUser;
}

/**
 * Every campaign as an offer option, scored on the ladder the bid prices, so an offer whose boost
 * costs more ranks lower. One eligibility for every offer until Almedia gives install overlap per offer.
 */
function campaignOptions(db: DbOrTx, config: Config): CampaignOption[] {
  // Cheapest first, as getGoals orders a ladder.
  const allGoals = db.select().from(goals).orderBy(asc(goals.payout)).all();
  const ladders = Map.groupBy(allGoals, (g: Goal) => g.offerId);
  return db
    .select({
      campaignId: campaigns.id,
      segment: campaigns.segment,
      valueTier: campaigns.valueTier,
      offerId: offers.id,
      platform: offers.platform,
      gameId: offers.gameId,
      genre: games.genre,
    })
    .from(campaigns)
    .innerJoin(offers, eq(offers.id, campaigns.offerId))
    .innerJoin(games, eq(games.id, offers.gameId))
    .all()
    .map((c) => ({
      ...c,
      goals: biddingLadder(config, ladders.get(c.offerId) ?? []),
      eligibility: config.funnel[c.platform].eligibility,
    }));
}
