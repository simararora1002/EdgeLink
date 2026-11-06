CREATE TABLE `links` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`target_url` text NOT NULL,
	`clicks` integer DEFAULT 0 NOT NULL,
	`owner_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `links_slug_unique` ON `links` (`slug`);--> statement-breakpoint
CREATE INDEX `links_owner_created_idx` ON `links` (`owner_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `rate_limit_hits` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`ts` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rate_limit_key_ts_idx` ON `rate_limit_hits` (`key`,`ts`);