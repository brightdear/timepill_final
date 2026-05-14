ALTER TABLE `crane_prizes` ADD COLUMN `price_jelly` integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE `crane_prizes` ADD COLUMN `source_type` text DEFAULT 'shop' NOT NULL;--> statement-breakpoint
ALTER TABLE `crane_prizes` ADD COLUMN `asset_collection` text DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE `crane_prizes` ADD COLUMN `asset_key` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `crane_prizes` ADD COLUMN `is_purchasable` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `crane_prizes` ADD COLUMN `is_crane_available` integer DEFAULT 1 NOT NULL;