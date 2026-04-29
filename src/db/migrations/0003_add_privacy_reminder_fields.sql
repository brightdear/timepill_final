ALTER TABLE `time_slots` ADD `display_alias` text;--> statement-breakpoint
ALTER TABLE `time_slots` ADD `privacy_level` text DEFAULT 'hideMedicationName' NOT NULL;--> statement-breakpoint
ALTER TABLE `time_slots` ADD `notification_title` text;--> statement-breakpoint
ALTER TABLE `time_slots` ADD `notification_body` text;--> statement-breakpoint
ALTER TABLE `time_slots` ADD `pre_reminder_enabled` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `time_slots` ADD `pre_reminder_minutes` integer DEFAULT 15 NOT NULL;--> statement-breakpoint
ALTER TABLE `time_slots` ADD `pre_reminder_body` text;--> statement-breakpoint
ALTER TABLE `time_slots` ADD `overdue_reminder_body` text;--> statement-breakpoint
ALTER TABLE `time_slots` ADD `reminder_intensity` text DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE `time_slots` ADD `repeat_reminders_enabled` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `time_slots` ADD `repeat_schedule` text;--> statement-breakpoint
ALTER TABLE `time_slots` ADD `max_repeat_duration_minutes` integer DEFAULT 180 NOT NULL;--> statement-breakpoint
ALTER TABLE `time_slots` ADD `snooze_minutes` integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE `time_slots` ADD `widget_visibility` text DEFAULT 'aliasOnly' NOT NULL;--> statement-breakpoint
ALTER TABLE `time_slots` ADD `lock_screen_visibility` text DEFAULT 'neutral' NOT NULL;--> statement-breakpoint
ALTER TABLE `time_slots` ADD `badge_enabled` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `dose_records` ADD `last_notification_sent_at` text;--> statement-breakpoint
ALTER TABLE `dose_records` ADD `snoozed_until` text;--> statement-breakpoint
ALTER TABLE `dose_records` ADD `skip_reason` text;--> statement-breakpoint
ALTER TABLE `settings` ADD `default_privacy_level` text DEFAULT 'hideMedicationName' NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `default_reminder_intensity` text DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `default_widget_visibility` text DEFAULT 'aliasOnly' NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `default_lock_screen_visibility` text DEFAULT 'neutral' NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `badge_enabled` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `allow_widget_direct_complete` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `complete_notification_enabled` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `external_app_label` text DEFAULT 'Daily Check' NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `private_notification_title` text DEFAULT 'Daily Check' NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `private_notification_body` text DEFAULT '체크할 시간이야' NOT NULL;
