CREATE INDEX `idx_dose_records_medication_date` ON `dose_records` (`medication_id`,`scheduled_time`);--> statement-breakpoint
CREATE INDEX `idx_dose_records_status` ON `dose_records` (`status`,`scheduled_time`);--> statement-breakpoint
CREATE INDEX `idx_reference_images_medication` ON `reference_images` (`medication_id`);
