CREATE TABLE `inventory_acquisitions` (
  `id` text PRIMARY KEY NOT NULL,
  `prize_id` text NOT NULL,
  `quantity` integer DEFAULT 1 NOT NULL,
  `source` text NOT NULL,
  `metadata` text,
  `acquired_at` text NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`prize_id`) REFERENCES `crane_prizes`(`id`) ON UPDATE no action ON DELETE cascade
);
