CREATE TABLE `captures` (
	`id` text PRIMARY KEY NOT NULL,
	`insta360_url` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`source_post_url` text,
	`source_author` text,
	`discovered_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_checked_at` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `captures_discovered_at_idx` ON `captures` (`discovered_at`);