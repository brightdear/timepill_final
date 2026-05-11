CREATE TABLE `crane_machine_state` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`visible_prize_ids` text DEFAULT '[]' NOT NULL,
	`pool_seed` text DEFAULT '' NOT NULL,
	`last_won_prize_id` text,
	`updated_at` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`last_won_prize_id`) REFERENCES `crane_prizes`(`id`) ON UPDATE no action ON DELETE set null
);