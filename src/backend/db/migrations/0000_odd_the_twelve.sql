CREATE TABLE `dose_records` (
	`id` text PRIMARY KEY NOT NULL,
	`medication_id` text,
	`medication_name` text NOT NULL,
	`time_slot_id` text,
	`day_key` text NOT NULL,
	`scheduled_time` text NOT NULL,
	`status` text NOT NULL,
	`target_dose_count` integer DEFAULT 1 NOT NULL,
	`completed_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`medication_id`) REFERENCES `medications`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`time_slot_id`) REFERENCES `time_slots`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_dose_slot_day` ON `dose_records` (`time_slot_id`,`day_key`);--> statement-breakpoint
CREATE TABLE `escape_records` (
	`id` text PRIMARY KEY NOT NULL,
	`medication_id` text,
	`time_slot_id` text,
	`dose_record_id` text,
	`day_key` text NOT NULL,
	`reason` text,
	`is_user_fault` integer DEFAULT 1 NOT NULL,
	`note` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`medication_id`) REFERENCES `medications`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`time_slot_id`) REFERENCES `time_slots`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`dose_record_id`) REFERENCES `dose_records`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `medications` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reference_images` (
	`id` text PRIMARY KEY NOT NULL,
	`medication_id` text NOT NULL,
	`original_uri` text NOT NULL,
	`cropped_uri` text NOT NULL,
	`embedding` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`medication_id`) REFERENCES `medications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`private_mode` integer DEFAULT 0 NOT NULL,
	`freezes_remaining` integer DEFAULT 0 NOT NULL,
	`language` text DEFAULT 'ko' NOT NULL,
	`dev_mode` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `time_slot_streaks` (
	`time_slot_id` text PRIMARY KEY NOT NULL,
	`current_streak` integer DEFAULT 0 NOT NULL,
	`longest_streak` integer DEFAULT 0 NOT NULL,
	`last_completed_date` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`time_slot_id`) REFERENCES `time_slots`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `time_slots` (
	`id` text PRIMARY KEY NOT NULL,
	`medication_id` text NOT NULL,
	`hour` integer NOT NULL,
	`minute` integer NOT NULL,
	`dose_count_per_intake` integer DEFAULT 1 NOT NULL,
	`cycle_config` text NOT NULL,
	`cycle_start_date` text,
	`verification_window_min` integer DEFAULT 60 NOT NULL,
	`alarm_enabled` integer DEFAULT 1 NOT NULL,
	`force_alarm` integer DEFAULT 0 NOT NULL,
	`popup_enabled` integer DEFAULT 1 NOT NULL,
	`snooze_count` integer DEFAULT 0 NOT NULL,
	`snooze_interval_min` integer DEFAULT 5 NOT NULL,
	`alarm_sound` text DEFAULT 'default' NOT NULL,
	`vibration_enabled` integer DEFAULT 1 NOT NULL,
	`skip_until` text,
	`notification_ids` text,
	`is_active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`medication_id`) REFERENCES `medications`(`id`) ON UPDATE no action ON DELETE cascade
);
