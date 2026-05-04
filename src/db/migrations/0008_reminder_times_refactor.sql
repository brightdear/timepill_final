ALTER TABLE `medications` ADD `alias_name` text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE `medications` ADD `actual_name` text;--> statement-breakpoint
ALTER TABLE `medications` ADD `remaining_quantity` integer;--> statement-breakpoint
ALTER TABLE `medications` ADD `dose_per_intake` integer NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `medications` ADD `is_archived` integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `medications` ADD `updated_at` text NOT NULL DEFAULT '';--> statement-breakpoint
UPDATE `medications`
SET
  `alias_name` = CASE WHEN `alias_name` = '' THEN `name` ELSE `alias_name` END,
  `remaining_quantity` = COALESCE(`remaining_quantity`, `current_quantity`),
  `updated_at` = CASE WHEN `updated_at` = '' THEN `created_at` ELSE `updated_at` END;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `reminder_times` (
  `id` text PRIMARY KEY NOT NULL,
  `medication_id` text NOT NULL,
  `display_alias` text,
  `hour` integer NOT NULL,
  `minute` integer NOT NULL,
  `is_enabled` integer NOT NULL DEFAULT 1,
  `order_index` integer NOT NULL DEFAULT 0,
  `dose_count_per_intake` integer NOT NULL DEFAULT 1,
  `cycle_config` text NOT NULL,
  `cycle_start_date` text,
  `verification_window_min` integer NOT NULL DEFAULT 60,
  `alarm_enabled` integer NOT NULL DEFAULT 1,
  `privacy_level` text NOT NULL DEFAULT 'hideMedicationName',
  `notification_title` text,
  `notification_body` text,
  `pre_reminder_enabled` integer NOT NULL DEFAULT 1,
  `pre_reminder_minutes` integer NOT NULL DEFAULT 15,
  `pre_reminder_body` text,
  `overdue_reminder_body` text,
  `reminder_intensity` text NOT NULL DEFAULT 'standard',
  `repeat_reminders_enabled` integer NOT NULL DEFAULT 1,
  `repeat_schedule` text,
  `max_repeat_duration_minutes` integer NOT NULL DEFAULT 180,
  `snooze_minutes` integer NOT NULL DEFAULT 10,
  `force_alarm` integer NOT NULL DEFAULT 0,
  `popup_enabled` integer NOT NULL DEFAULT 1,
  `snooze_count` integer NOT NULL DEFAULT 0,
  `snooze_interval_min` integer NOT NULL DEFAULT 5,
  `alarm_sound` text NOT NULL DEFAULT 'default',
  `vibration_enabled` integer NOT NULL DEFAULT 1,
  `widget_visibility` text NOT NULL DEFAULT 'aliasOnly',
  `lock_screen_visibility` text NOT NULL DEFAULT 'neutral',
  `badge_enabled` integer NOT NULL DEFAULT 1,
  `skip_until` text,
  `notification_ids` text,
  `force_notification_ids` text,
  `is_active` integer NOT NULL DEFAULT 1,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL DEFAULT '',
  FOREIGN KEY (`medication_id`) REFERENCES `medications`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
INSERT OR IGNORE INTO `reminder_times` (
  `id`, `medication_id`, `display_alias`, `hour`, `minute`, `is_enabled`, `order_index`,
  `dose_count_per_intake`, `cycle_config`, `cycle_start_date`, `verification_window_min`,
  `alarm_enabled`, `privacy_level`, `notification_title`, `notification_body`,
  `pre_reminder_enabled`, `pre_reminder_minutes`, `pre_reminder_body`, `overdue_reminder_body`,
  `reminder_intensity`, `repeat_reminders_enabled`, `repeat_schedule`, `max_repeat_duration_minutes`,
  `snooze_minutes`, `force_alarm`, `popup_enabled`, `snooze_count`, `snooze_interval_min`,
  `alarm_sound`, `vibration_enabled`, `widget_visibility`, `lock_screen_visibility`, `badge_enabled`,
  `skip_until`, `notification_ids`, `force_notification_ids`, `is_active`, `created_at`, `updated_at`
)
SELECT
  `id`, `medication_id`, `display_alias`, `hour`, `minute`, `alarm_enabled`,
  ROW_NUMBER() OVER (PARTITION BY `medication_id` ORDER BY `hour`, `minute`, `created_at`) - 1,
  `dose_count_per_intake`, `cycle_config`, `cycle_start_date`, `verification_window_min`,
  `alarm_enabled`, `privacy_level`, `notification_title`, `notification_body`,
  `pre_reminder_enabled`, `pre_reminder_minutes`, `pre_reminder_body`, `overdue_reminder_body`,
  `reminder_intensity`, `repeat_reminders_enabled`, `repeat_schedule`, `max_repeat_duration_minutes`,
  `snooze_minutes`, `force_alarm`, `popup_enabled`, `snooze_count`, `snooze_interval_min`,
  `alarm_sound`, `vibration_enabled`, `widget_visibility`, `lock_screen_visibility`, `badge_enabled`,
  `skip_until`, `notification_ids`, `force_notification_ids`, `is_active`, `created_at`, `created_at`
FROM `time_slots`;--> statement-breakpoint
ALTER TABLE `dose_records` ADD `reminder_time_id` text;--> statement-breakpoint
ALTER TABLE `dose_records` ADD `scheduled_date` text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE `dose_records` ADD `scheduled_at` text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE `dose_records` ADD `checked_at` text;--> statement-breakpoint
ALTER TABLE `dose_records` ADD `verification_type` text NOT NULL DEFAULT 'none';--> statement-breakpoint
ALTER TABLE `dose_records` ADD `jelly_reward_granted` integer NOT NULL DEFAULT 0;--> statement-breakpoint
UPDATE `dose_records`
SET
  `reminder_time_id` = COALESCE(`reminder_time_id`, `time_slot_id`),
  `scheduled_date` = CASE WHEN `scheduled_date` = '' THEN `day_key` ELSE `scheduled_date` END,
  `scheduled_at` = CASE WHEN `scheduled_at` = '' THEN `scheduled_time` ELSE `scheduled_at` END,
  `checked_at` = COALESCE(`checked_at`, `completed_at`),
  `verification_type` = CASE WHEN `completed_at` IS NULL THEN `verification_type` ELSE 'manual' END,
  `jelly_reward_granted` = CASE WHEN `status` IN ('completed', 'frozen') THEN 1 ELSE `jelly_reward_granted` END;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_reminder_times_medication` ON `reminder_times` (`medication_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_reminder_times_order` ON `reminder_times` (`medication_id`, `order_index`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_dose_records_reminder_date` ON `dose_records` (`reminder_time_id`, `scheduled_date`);
