CREATE TABLE `state_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`day_key` text NOT NULL,
	`mood` text NOT NULL,
	`condition` text NOT NULL,
	`focus` text NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`memo` text,
	`reward_granted` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);--> statement-breakpoint
CREATE TABLE `wallet` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`balance` integer DEFAULT 0 NOT NULL,
	`today_earned` integer DEFAULT 0 NOT NULL,
	`total_earned` integer DEFAULT 0 NOT NULL,
	`last_earned_date` text DEFAULT '' NOT NULL,
	`daily_state_reward_count` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT '' NOT NULL
);--> statement-breakpoint
INSERT OR IGNORE INTO `wallet` (`id`, `balance`, `today_earned`, `total_earned`, `last_earned_date`, `daily_state_reward_count`, `updated_at`)
VALUES (1, 0, 0, 0, '', 0, '');--> statement-breakpoint
CREATE TABLE `reward_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`day_key` text NOT NULL,
	`amount` integer NOT NULL,
	`kind` text NOT NULL,
	`label` text NOT NULL,
	`reference_id` text,
	`created_at` text NOT NULL
);--> statement-breakpoint
CREATE TABLE `streak_state` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`current_streak` integer DEFAULT 0 NOT NULL,
	`longest_streak` integer DEFAULT 0 NOT NULL,
	`last_check_date` text DEFAULT '' NOT NULL,
	`freeze_count` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT '' NOT NULL
);--> statement-breakpoint
INSERT OR IGNORE INTO `streak_state` (`id`, `current_streak`, `longest_streak`, `last_check_date`, `freeze_count`, `updated_at`)
VALUES (1, 0, 0, '', 0, '');--> statement-breakpoint
CREATE TABLE `crane_prizes` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`rarity` text NOT NULL,
	`emoji` text NOT NULL,
	`weight` integer NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL
);--> statement-breakpoint
CREATE TABLE `inventory_items` (
	`id` text PRIMARY KEY NOT NULL,
	`prize_id` text NOT NULL,
	`quantity` integer DEFAULT 0 NOT NULL,
	`last_acquired_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`prize_id`) REFERENCES `crane_prizes`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_inventory_prize` ON `inventory_items` (`prize_id`);--> statement-breakpoint
CREATE TABLE `crane_plays` (
	`id` text PRIMARY KEY NOT NULL,
	`prize_id` text,
	`cost` integer NOT NULL,
	`reward_transaction_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`prize_id`) REFERENCES `crane_prizes`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`reward_transaction_id`) REFERENCES `reward_transactions`(`id`) ON UPDATE no action ON DELETE set null
);--> statement-breakpoint