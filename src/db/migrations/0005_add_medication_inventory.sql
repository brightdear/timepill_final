ALTER TABLE `medications` ADD `total_quantity` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `medications` ADD `current_quantity` integer DEFAULT 0 NOT NULL;