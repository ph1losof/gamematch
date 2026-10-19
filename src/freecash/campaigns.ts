/**
 * Campaigns: one per offer, segment and value tier. Offers are per platform, so iOS and Android get
 * separate bids (iOS installs are credited less often); each segment and tier gets its own bid
 * (recent players and big earners are worth more), and the network reports spend per campaign, so
 * the readout can charge each segment and tier its own spend. Who each campaign shows ads to is
 * audiences.ts's job.
 */
import { and, count, eq, isNull, sql } from 'drizzle-orm';
import { maxCpm } from '../model/bidding';
import { type Segment, segmentFunnel, tierFunnel, type ValueTier } from '../model/segments';
import type { Micros } from '../shared/money';
import type { Platform } from '../shared/types';
import { newId } from '../shared/util';
import { syncAudiences } from './audiences';
import type { Config } from './config';
import { type DbOrTx, onlyRow } from './db';
import type { Deps } from './deps';
import { acct, balance } from './ledger';
import { getGoals, getOfferWithGame } from './offers';
import { biddingLadder, creativeFor, hasGoals } from './personalise';
import { adClicks, campaigns, conversions, type Goal, offerStarts } from './schema';

/** Why a launch was refused; app.ts maps each to a status code. */
export type LaunchRefusal = 'unknown_offer' | 'platform_disabled' | 'no_goals' | 'already_launched';

/**
 * The CPM we bid: the fixed test CPM for the platform when set (the first live test buys at the
 * market price to measure CTR and incrementality), else the value-based bid. The value bid uses the
 * shared model in the dashboard's order: tier lifts, segment lifts, then value per impression with
 * the offer's eligibility haircut, on the ladder with the boost's expected cost priced in.
 * Buying per action (CPA) would be another branch here.
 */
function bidFor(
  config: Pick<
    Config,
    | 'funnel'
    | 'tierLift'
    | 'segmentLift'
    | 'fixedBidCpm'
    | 'targetMargin'
    | 'clickPath'
    | 'linkedBoost'
  >,
  platform: Platform,
  segment: Segment,
  valueTier: ValueTier,
  ladder: Goal[],
): Micros {
  const fixed = config.fixedBidCpm[platform];
  if (fixed !== undefined) return fixed;
  const funnel = segmentFunnel(
    tierFunnel(config.funnel[platform], config.tierLift[valueTier]),
    config.segmentLift[segment],
  );
  return maxCpm(funnel, biddingLadder(config, ladder), config.targetMargin);
}

/**
 * Re-engagement campaigns (Moloco, Google) only accept a tracking link from the promoted app's own
 * MMP, which deep-links into the app. Ours is Freecash's MMP's retargeting click to /go/:campaign,
 * a universal link: it opens the Freecash app when installed and the web landing page when not.
 * The MMP owns the URL format and the network owns its macros, so this only composes the two.
 */
function reengagementLink(
  { config, adNetwork, attribution }: Pick<Deps, 'config' | 'adNetwork' | 'attribution'>,
  platform: Platform,
  campaignId: string,
) {
  const m = adNetwork.macros;
  return attribution.retargetingClickUrl({
    appId: config.freecashAppId[platform],
    platform,
    mediaSource: adNetwork.name,
    clickId: m.clickId,
    deviceId: m.deviceId,
    deepLink: `${config.publicUrl}/go/${campaignId}`,
    deepLinkParams: { ifa: m.deviceId, imp: m.impressionId, pub: m.publisherApp },
  });
}

/** A second campaign would bid against the first for the same audience and split the funnel. */
const isLaunched = (db: DbOrTx, offerId: string, segment: Segment, valueTier: ValueTier) =>
  db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(
      and(
        eq(campaigns.offerId, offerId),
        eq(campaigns.segment, segment),
        eq(campaigns.valueTier, valueTier),
      ),
    )
    .get() !== undefined;

export async function launchCampaign(
  deps: Pick<Deps, 'db' | 'clock' | 'config' | 'adNetwork' | 'attribution'>,
  offerId: string,
  segment: Segment,
  valueTier: ValueTier,
) {
  const { db, clock, config, adNetwork } = deps;
  const refused = (reason: LaunchRefusal) => ({ kind: 'refused' as const, reason });
  const found = getOfferWithGame(db, offerId);
  if (!found) return refused('unknown_offer');
  const { offer, game } = found;
  if (!config.platforms.includes(offer.platform)) return refused('platform_disabled');
  const ladder = getGoals(db, offer.id);
  if (!hasGoals(ladder)) return refused('no_goals');
  if (isLaunched(db, offerId, segment, valueTier)) return refused('already_launched');

  const id = newId('cmp');
  const bidCpm = bidFor(config, offer.platform, segment, valueTier, ladder);
  // Create with an empty audience, then plan all audiences together so no user lands in two campaigns.
  const audienceId = await adNetwork.createAudience(`gamematch-${id}`, []);
  const networkCampaignId = await adNetwork.createCampaign({
    name: `gamematch-${offer.id}-${segment}-${valueTier}`,
    audienceId,
    bidCpm,
    // No one campaign can spend past the test budget, even if our spend sync stops running.
    totalBudget: config.testBudget,
    frequencyCapPerDay: config.frequencyCapPerDay,
    clickUrl: reengagementLink(deps, offer.platform, id),
    creative: creativeFor(game, ladder, segment),
  });
  db.insert(campaigns)
    .values({
      id,
      offerId,
      segment,
      valueTier,
      networkCampaignId,
      networkAudienceId: audienceId,
      bidCpm,
      createdAt: clock.now(),
    })
    .run();
  const sizes = await syncAudiences(deps);
  return {
    kind: 'launched' as const,
    campaign: { id, segment, valueTier, audienceSize: sizes[id] ?? 0, bidCpm },
  };
}

/** Stops delivery at the network (a policy flag, a broken page, the budget). Null if we don't know the campaign. */
export async function pauseCampaign(
  { db, adNetwork }: Pick<Deps, 'db' | 'adNetwork'>,
  campaignId: string,
) {
  const c = db
    .select({ networkCampaignId: campaigns.networkCampaignId })
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .get();
  if (!c) return null;
  await adNetwork.pause(c.networkCampaignId);
  return { id: campaignId, paused: true };
}

/** Funnel for one campaign, from the network's impressions down to our own margin. */
export async function campaignReport(
  { db, adNetwork }: Pick<Deps, 'db' | 'adNetwork'>,
  campaignId: string,
) {
  const c = db.select().from(campaigns).where(eq(campaigns.id, campaignId)).get();
  if (!c) return null;
  const network = await adNetwork.report(c.networkCampaignId);
  const fromThisCampaign = eq(adClicks.campaignId, c.id);
  // One start per ad click at most, so counting both sides of the join counts each once.
  const funnel = onlyRow(
    db
      .select({ adClicks: count(adClicks.id), offerStarts: count(offerStarts.id) })
      .from(adClicks)
      .leftJoin(offerStarts, eq(offerStarts.adClickId, adClicks.id))
      .where(fromThisCampaign)
      .get(),
  );
  const money = onlyRow(
    db
      .select({
        conversions: count(),
        revenue: sql<number>`coalesce(sum(${conversions.payout}), 0)`,
        rewards: sql<number>`coalesce(sum(${conversions.reward}), 0)`,
      })
      .from(conversions)
      .innerJoin(offerStarts, eq(offerStarts.id, conversions.offerStartId))
      .innerJoin(adClicks, eq(adClicks.id, offerStarts.adClickId))
      .where(and(fromThisCampaign, isNull(conversions.reversedAt)))
      .get(),
  );
  const spend = balance(db, acct.adSpend(c.id));
  return {
    id: c.id,
    offerId: c.offerId,
    segment: c.segment,
    valueTier: c.valueTier,
    bidCpm: c.bidCpm,
    impressions: network.days.reduce((s, d) => s + d.impressions, 0),
    ...funnel,
    ...money,
    spendBooked: spend,
    spendReported: network.days.reduce((s, d) => s + d.spend, 0),
    networkConversions: network.conversions,
    margin: money.revenue - money.rewards - spend,
  };
}
