CREATE TABLE `asin_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`product` text NOT NULL,
	`current_asin` text NOT NULL,
	`previous_asin` text NOT NULL,
	`merged_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `asin_history_user_idx` ON `asin_history` (`user_id`);--> statement-breakpoint
CREATE TABLE `detected_changes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`previous_upload_id` text,
	`current_upload_id` text NOT NULL,
	`kind` text NOT NULL,
	`asin` text NOT NULL,
	`sku` text DEFAULT '' NOT NULL,
	`parent_sku` text DEFAULT '' NOT NULL,
	`product` text DEFAULT '' NOT NULL,
	`previous_asin` text DEFAULT '' NOT NULL,
	`current_asin` text DEFAULT '' NOT NULL,
	`details` text NOT NULL,
	`status` text DEFAULT 'Ready to merge' NOT NULL,
	`confidence` integer DEFAULT 100 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`current_upload_id`) REFERENCES `uploads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `changes_user_created_idx` ON `detected_changes` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `snapshot_rows` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`upload_id` text NOT NULL,
	`user_id` text NOT NULL,
	`report_type` text NOT NULL,
	`record_key` text NOT NULL,
	`asin` text DEFAULT '' NOT NULL,
	`parent_asin` text DEFAULT '' NOT NULL,
	`sku` text DEFAULT '' NOT NULL,
	`month` text DEFAULT '' NOT NULL,
	`data` text NOT NULL,
	FOREIGN KEY (`upload_id`) REFERENCES `uploads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `snapshot_rows_upload_idx` ON `snapshot_rows` (`upload_id`);--> statement-breakpoint
CREATE INDEX `snapshot_rows_user_asin_idx` ON `snapshot_rows` (`user_id`,`asin`);--> statement-breakpoint
CREATE TABLE `uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`report_type` text NOT NULL,
	`file_name` text NOT NULL,
	`file_size` integer NOT NULL,
	`sheet_name` text NOT NULL,
	`row_count` integer NOT NULL,
	`valid_count` integer NOT NULL,
	`invalid_count` integer NOT NULL,
	`parents_count` integer DEFAULT 0 NOT NULL,
	`children_count` integer DEFAULT 0 NOT NULL,
	`revenue_cents` integer DEFAULT 0 NOT NULL,
	`changes_count` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `uploads_user_type_created_idx` ON `uploads` (`user_id`,`report_type`,`created_at`);