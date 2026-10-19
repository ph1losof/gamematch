CREATE TABLE `ad_clicks` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`user_id` text,
	`device_id` text,
	`impression_id` text,
	`publisher_app` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `advertisers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`postback_secret` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`offer_id` text NOT NULL,
	`segment` text NOT NULL,
	`value_tier` text NOT NULL,
	`network_campaign_id` text NOT NULL,
	`network_audience_id` text NOT NULL,
	`bid_cpm` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`offer_id`) REFERENCES `offers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `campaigns_offer_segment_tier` ON `campaigns` (`offer_id`,`segment`,`value_tier`);--> statement-breakpoint
CREATE TABLE `conversions` (
	`id` text PRIMARY KEY NOT NULL,
	`offer_start_id` text NOT NULL,
	`user_id` text NOT NULL,
	`offer_id` text NOT NULL,
	`event` text NOT NULL,
	`payout` integer NOT NULL,
	`reward` integer NOT NULL,
	`postback_id` integer NOT NULL,
	`created_at` integer NOT NULL,
	`released_at` integer,
	`reversed_at` integer,
	FOREIGN KEY (`offer_start_id`) REFERENCES `offer_starts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`offer_id`) REFERENCES `offers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`postback_id`) REFERENCES `postbacks`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "conversion_reward_within_payout" CHECK("conversions"."reward" <= "conversions"."payout")
);
--> statement-breakpoint
CREATE INDEX `conversions_user` ON `conversions` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `conversions_goal_once` ON `conversions` (`user_id`,`offer_id`,`event`);--> statement-breakpoint
CREATE TABLE `devices` (
	`device_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`platform` text NOT NULL,
	`tracking_allowed` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `devices_user` ON `devices` (`user_id`);--> statement-breakpoint
CREATE TABLE `experiment_members` (
	`user_id` text PRIMARY KEY NOT NULL,
	`arm` text NOT NULL,
	`segment` text NOT NULL,
	`value_tier` text NOT NULL,
	`platform` text NOT NULL,
	`enrolled_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `games` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`genre` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `goals` (
	`offer_id` text NOT NULL,
	`event` text NOT NULL,
	`label` text NOT NULL,
	`payout` integer NOT NULL,
	`reward` integer NOT NULL,
	`deadline_days` integer NOT NULL,
	`requires_purchase` integer DEFAULT false NOT NULL,
	`completion_rate` real NOT NULL,
	`min_days` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`offer_id`, `event`),
	FOREIGN KEY (`offer_id`) REFERENCES `offers`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "reward_within_payout" CHECK("goals"."reward" <= "goals"."payout")
);
--> statement-breakpoint
CREATE TABLE `ledger` (
	`id` integer PRIMARY KEY NOT NULL,
	`txn_id` text NOT NULL,
	`kind` text NOT NULL,
	`ref` text NOT NULL,
	`account` text NOT NULL,
	`amount` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ledger_account` ON `ledger` (`account`);--> statement-breakpoint
CREATE TABLE `links` (
	`user_id` text NOT NULL,
	`game_id` text NOT NULL,
	`linked_at` integer NOT NULL,
	`last_active_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `game_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `offer_starts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`offer_id` text NOT NULL,
	`channel` text NOT NULL,
	`ad_click_id` text,
	`device_id` text,
	`created_at` integer NOT NULL,
	`installed_at` integer,
	`boost_event` text,
	`boost_reward` integer,
	`boost_until` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`offer_id`) REFERENCES `offers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ad_click_id`) REFERENCES `ad_clicks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `offer_starts_user` ON `offer_starts` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `offer_starts_ad_click` ON `offer_starts` (`ad_click_id`);--> statement-breakpoint
CREATE TABLE `offers` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`advertiser_id` text NOT NULL,
	`platform` text NOT NULL,
	`tracking_url` text NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`advertiser_id`) REFERENCES `advertisers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `postbacks` (
	`id` integer PRIMARY KEY NOT NULL,
	`advertiser_id` text NOT NULL,
	`dedup_key` text NOT NULL,
	`click_id` text NOT NULL,
	`event` text NOT NULL,
	`device_id` text,
	`event_at` integer NOT NULL,
	`received_at` integer NOT NULL,
	`outcome` text NOT NULL,
	FOREIGN KEY (`advertiser_id`) REFERENCES `advertisers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `postbacks_event` ON `postbacks` (`advertiser_id`,`dedup_key`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`age` integer NOT NULL,
	`country` text NOT NULL,
	`ads_consent` integer DEFAULT false NOT NULL,
	`link_earnings` integer DEFAULT 0 NOT NULL
);
