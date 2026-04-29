-- 1. frozen 레코드를 completed로 변환 (frozen 상태 완전 제거)
UPDATE `dose_records` SET `status` = 'completed' WHERE `status` = 'frozen';
--> statement-breakpoint

-- 2. time_slot_streaks 테이블 삭제
DROP TABLE IF EXISTS `time_slot_streaks`;
--> statement-breakpoint

-- 3. settings 테이블에서 freezes_remaining 제거 (SQLite는 DROP COLUMN을 지원하지 않으므로 재생성)
CREATE TABLE `settings_new` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`private_mode` integer DEFAULT 0 NOT NULL,
	`language` text DEFAULT 'ko' NOT NULL,
	`dev_mode` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
INSERT INTO `settings_new` (`id`, `private_mode`, `language`, `dev_mode`)
SELECT `id`, `private_mode`, `language`, `dev_mode` FROM `settings`;
--> statement-breakpoint
DROP TABLE `settings`;
--> statement-breakpoint
ALTER TABLE `settings_new` RENAME TO `settings`;
