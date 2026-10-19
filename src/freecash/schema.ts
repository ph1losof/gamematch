/**
 * Money columns are integer micro-dollars. Times are epoch milliseconds.
 * Uniqueness constraints carry the money rules: an event pays once (postbacks), and a goal
 * pays once per user and offer (conversions).
 */
import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  unique,
} from 'drizzle-orm/sqlite-core';
import { SEGMENTS, VALUE_TIERS } from '../model/segments';
import { PLATFORMS } from '../shared/types';

const platform = (name: string) => text(name, { enum: PLATFORMS }).notNull();
const createdAt = () => integer('created_at').notNull();

export const users = sqliteTable('users', {
  id: text().primaryKey(),
  name: text().notNull(),
  age: integer().notNull(),
  country: text().notNull(),
  /** Opted in to being shown Freecash ads in other apps. */
  adsConsent: integer('ads_consent', { mode: 'boolean' }).notNull().default(false),
  /** Lifetime earnings from linked games (Link), in micros. Sets the user's value tier at enrollment. */
  linkEarnings: integer('link_earnings').notNull().default(0),
});

export const devices = sqliteTable(
  'devices',
  {
    /** GAID / IDFA, lowercase. */
    deviceId: text('device_id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    platform: platform('platform'),
    /** iOS: ATT allowed in Freecash. Android: ad ID not opted out. */
    trackingAllowed: integer('tracking_allowed', { mode: 'boolean' }).notNull(),
  },
  (t) => [index('devices_user').on(t.userId)],
);

export const games = sqliteTable('games', {
  id: text().primaryKey(),
  name: text().notNull(),
  genre: text().notNull(),
});

export const links = sqliteTable(
  'links',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    gameId: text('game_id')
      .notNull()
      .references(() => games.id),
    linkedAt: integer('linked_at').notNull(),
    /** Last progress event from the linked game (Link postbacks). Drives the user's segment. */
    lastActiveAt: integer('last_active_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.gameId] })],
);

export const advertisers = sqliteTable('advertisers', {
  id: text().primaryKey(),
  name: text().notNull(),
  postbackSecret: text('postback_secret').notNull(),
});

export const offers = sqliteTable('offers', {
  id: text().primaryKey(),
  gameId: text('game_id')
    .notNull()
    .references(() => games.id),
  advertiserId: text('advertiser_id')
    .notNull()
    .references(() => advertisers.id),
  platform: platform('platform'),
  /** The advertiser's MMP link, with {click_id} {device_id} {sub_site} placeholders. */
  trackingUrl: text('tracking_url').notNull(),
});

export const goals = sqliteTable(
  'goals',
  {
    offerId: text('offer_id')
      .notNull()
      .references(() => offers.id),
    /** MMP event name, e.g. install, level_10. */
    event: text().notNull(),
    label: text().notNull(),
    /** What the advertiser pays us. */
    payout: integer().notNull(),
    /** What we pay the user. */
    reward: integer().notNull(),
    /** Counted from the install (from the offer start until the install is seen). */
    deadlineDays: integer('deadline_days').notNull(),
    /** Shown on the landing page and left out of the ad's "earn up to" total. */
    requiresPurchase: integer('requires_purchase', { mode: 'boolean' }).notNull().default(false),
    /** Historical share of installers who reach this goal; feeds the bid. */
    completionRate: real('completion_rate').notNull(),
    /** The earliest a player can reach it, in days after the install ("play 7 days" is 7). A boost window must fit it. */
    minDays: integer('min_days').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.offerId, t.event] }),
    check('reward_within_payout', sql`${t.reward} <= ${t.payout}`),
  ],
);

export const experimentMembers = sqliteTable('experiment_members', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id),
  arm: text({ enum: ['treatment', 'control'] }).notNull(),
  /** Frozen at enrollment, so it's a valid stratum for the readout. */
  segment: text({ enum: SEGMENTS }).notNull(),
  /** Also frozen at enrollment, from Link earnings before any ad ran. */
  valueTier: text('value_tier', { enum: VALUE_TIERS }).notNull(),
  /** The platform of the device we target. Spend is per platform too (offers are), so the readout can split by it. */
  platform: platform('platform'),
  enrolledAt: integer('enrolled_at').notNull(),
});

/**
 * One per offer, segment and value tier, so each gets its own audience and bid, and the network's
 * per-campaign spend report splits spend by segment and by tier.
 */
export const campaigns = sqliteTable(
  'campaigns',
  {
    id: text().primaryKey(),
    offerId: text('offer_id')
      .notNull()
      .references(() => offers.id),
    segment: text({ enum: SEGMENTS }).notNull(),
    valueTier: text('value_tier', { enum: VALUE_TIERS }).notNull(),
    networkCampaignId: text('network_campaign_id').notNull(),
    networkAudienceId: text('network_audience_id').notNull(),
    bidCpm: integer('bid_cpm').notNull(),
    createdAt: createdAt(),
  },
  (t) => [unique('campaigns_offer_segment_tier').on(t.offerId, t.segment, t.valueTier)],
);

/** A tap on our ad. The user is known only if the ad ID matched one of our devices. */
export const adClicks = sqliteTable('ad_clicks', {
  id: text().primaryKey(),
  campaignId: text('campaign_id')
    .notNull()
    .references(() => campaigns.id),
  userId: text('user_id').references(() => users.id),
  deviceId: text('device_id'),
  impressionId: text('impression_id'),
  publisherApp: text('publisher_app'),
  createdAt: createdAt(),
});

/** A user starting an offer. Its id is the click ID we put in the advertiser's tracking link. */
export const offerStarts = sqliteTable(
  'offer_starts',
  {
    id: text().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    offerId: text('offer_id')
      .notNull()
      .references(() => offers.id),
    channel: text({ enum: ['gamematch', 'offerwall'] }).notNull(),
    adClickId: text('ad_click_id').references(() => adClicks.id),
    deviceId: text('device_id'),
    createdAt: createdAt(),
    /** When the install happened (the MMP's install time); later goals' deadlines count from here. */
    installedAt: integer('installed_at'),
    /** Linked-player boost, priced once at Start: `boostEvent` pays `boostReward` if reached by `boostUntil`. */
    boostEvent: text('boost_event'),
    boostReward: integer('boost_reward'),
    boostUntil: integer('boost_until'),
  },
  // One start per ad click: a double tap on Start returns the same click ID.
  (t) => [index('offer_starts_user').on(t.userId), unique('offer_starts_ad_click').on(t.adClickId)],
);

/** Every authentic postback, with what we decided about it. */
export const postbacks = sqliteTable(
  'postbacks',
  {
    id: integer().primaryKey(),
    advertiserId: text('advertiser_id')
      .notNull()
      .references(() => advertisers.id),
    /** The MMP's event ID when it sends one; otherwise click ID + event + event time (AppsFlyer has no event-ID macro). */
    dedupKey: text('dedup_key').notNull(),
    clickId: text('click_id').notNull(),
    event: text().notNull(),
    deviceId: text('device_id'),
    eventAt: integer('event_at').notNull(),
    receivedAt: integer('received_at').notNull(),
    /** What we decided. Only `converted` moves money. */
    outcome: text({
      enum: [
        'converted',
        'rejected_by_mmp',
        'unknown_click',
        'not_a_goal',
        'before_start',
        'past_deadline',
        'device_mismatch',
        'already_converted',
      ],
    }).notNull(),
  },
  (t) => [unique('postbacks_event').on(t.advertiserId, t.dedupKey)],
);

export const conversions = sqliteTable(
  'conversions',
  {
    id: text().primaryKey(),
    offerStartId: text('offer_start_id')
      .notNull()
      .references(() => offerStarts.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    offerId: text('offer_id')
      .notNull()
      .references(() => offers.id),
    event: text().notNull(),
    payout: integer().notNull(),
    reward: integer().notNull(),
    postbackId: integer('postback_id')
      .notNull()
      .references(() => postbacks.id),
    createdAt: createdAt(),
    /** The reward is pending until released after the hold; a reversal before that undoes the conversion. */
    releasedAt: integer('released_at'),
    reversedAt: integer('reversed_at'),
  },
  (t) => [
    unique('conversions_goal_once').on(t.userId, t.offerId, t.event),
    index('conversions_user').on(t.userId),
    // Boosted or not, we never pay a user more than the advertiser pays us for the goal.
    check('conversion_reward_within_payout', sql`${t.reward} <= ${t.payout}`),
  ],
);

/** Append-only double-entry ledger. Each txn's amounts sum to zero. */
export const ledger = sqliteTable(
  'ledger',
  {
    id: integer().primaryKey(),
    txnId: text('txn_id').notNull(),
    kind: text().notNull(),
    ref: text().notNull(),
    account: text().notNull(),
    amount: integer().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('ledger_account').on(t.account)],
);

export type Offer = typeof offers.$inferSelect;
export type Goal = typeof goals.$inferSelect;
export type Game = typeof games.$inferSelect;
export type Arm = (typeof experimentMembers.$inferSelect)['arm'];
export type Channel = (typeof offerStarts.$inferSelect)['channel'];
/** A stored postback outcome, or `duplicate` for a redelivery we drop without storing. */
export type Outcome = (typeof postbacks.$inferSelect)['outcome'] | 'duplicate';
