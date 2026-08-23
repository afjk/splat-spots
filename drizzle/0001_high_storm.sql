CREATE TABLE `capture_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`capture_id` text NOT NULL,
	`request_type` text NOT NULL,
	`requester_email` text NOT NULL,
	`relationship` text DEFAULT '' NOT NULL,
	`message` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`status` text DEFAULT 'open' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `capture_reports_status_created_idx` ON `capture_reports` (`status`,`created_at`);