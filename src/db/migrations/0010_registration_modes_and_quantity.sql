ALTER TABLE `medications` ADD `quantity_tracking_enabled` integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `medications` ADD `privacy_level` text NOT NULL DEFAULT 'hideMedicationName';--> statement-breakpoint
ALTER TABLE `medications` ADD `widget_display_mode` text NOT NULL DEFAULT 'aliasOnly';--> statement-breakpoint
ALTER TABLE `medications` ADD `reminder_intensity` text NOT NULL DEFAULT 'normal';--> statement-breakpoint
ALTER TABLE `reminder_times` ADD `reminder_mode` text NOT NULL DEFAULT 'notify';--> statement-breakpoint
UPDATE `settings`
SET `default_reminder_intensity` = CASE
  WHEN `default_reminder_intensity` = 'standard' THEN 'normal'
  WHEN `default_reminder_intensity` = 'strict' THEN 'strong'
  WHEN `default_reminder_intensity` IS NULL OR `default_reminder_intensity` = '' THEN 'normal'
  ELSE `default_reminder_intensity`
END;--> statement-breakpoint
UPDATE `reminder_times`
SET
  `reminder_mode` = CASE WHEN `is_enabled` = 0 THEN 'off' ELSE 'notify' END,
  `reminder_intensity` = CASE
    WHEN `reminder_intensity` = 'standard' THEN 'normal'
    WHEN `reminder_intensity` = 'strict' THEN 'strong'
    WHEN `reminder_intensity` IS NULL OR `reminder_intensity` = '' THEN 'normal'
    ELSE `reminder_intensity`
  END,
  `is_enabled` = CASE WHEN `is_enabled` = 0 THEN 0 ELSE 1 END,
  `alarm_enabled` = CASE WHEN `is_enabled` = 0 THEN 0 ELSE 1 END;--> statement-breakpoint
UPDATE `medications`
SET
  `quantity_tracking_enabled` = CASE
    WHEN COALESCE(`remaining_quantity`, 0) > 0 OR COALESCE(`total_quantity`, 0) > 0 THEN 1
    ELSE 0
  END,
  `privacy_level` = COALESCE((
    SELECT `privacy_level`
    FROM `reminder_times`
    WHERE `medication_id` = `medications`.`id`
    ORDER BY `order_index`, `hour`, `minute`, `created_at`
    LIMIT 1
  ), `privacy_level`),
  `widget_display_mode` = COALESCE((
    SELECT `widget_visibility`
    FROM `reminder_times`
    WHERE `medication_id` = `medications`.`id`
    ORDER BY `order_index`, `hour`, `minute`, `created_at`
    LIMIT 1
  ), `widget_display_mode`),
  `reminder_intensity` = COALESCE((
    SELECT CASE
      WHEN `reminder_intensity` = 'standard' THEN 'normal'
      WHEN `reminder_intensity` = 'strict' THEN 'strong'
      WHEN `reminder_intensity` IS NULL OR `reminder_intensity` = '' THEN 'normal'
      ELSE `reminder_intensity`
    END
    FROM `reminder_times`
    WHERE `medication_id` = `medications`.`id`
    ORDER BY `order_index`, `hour`, `minute`, `created_at`
    LIMIT 1
  ), `reminder_intensity`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_reminder_times_mode` ON `reminder_times` (`medication_id`, `reminder_mode`);