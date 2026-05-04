UPDATE `medications`
SET
  `total_quantity` = COALESCE(`total_quantity`, 0),
  `current_quantity` = COALESCE(`current_quantity`, 0),
  `remaining_quantity` = COALESCE(`remaining_quantity`, `current_quantity`, `total_quantity`, 0),
  `dose_per_intake` = COALESCE(`dose_per_intake`, 1),
  `updated_at` = CASE WHEN `updated_at` IS NULL OR `updated_at` = '' THEN `created_at` ELSE `updated_at` END;--> statement-breakpoint
ALTER TABLE `reward_transactions` ADD `is_dev_mode` integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `crane_plays` ADD `is_dev_mode` integer NOT NULL DEFAULT 0;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `medications_remaining_quantity_default`
AFTER INSERT ON `medications`
WHEN NEW.`remaining_quantity` IS NULL
BEGIN
  UPDATE `medications`
  SET `remaining_quantity` = COALESCE(NEW.`current_quantity`, NEW.`total_quantity`, 0)
  WHERE `id` = NEW.`id`;
END;
