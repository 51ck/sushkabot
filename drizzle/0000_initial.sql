CREATE TABLE `chats` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`telegram_chat_id` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`timezone` text DEFAULT 'UTC' NOT NULL,
	`checkin_hour` integer DEFAULT 21 NOT NULL,
	`checkin_minute` integer DEFAULT 0 NOT NULL,
	`window_duration_minutes` integer DEFAULT 120 NOT NULL,
	`question_text` text DEFAULT 'Was you sober today?' NOT NULL,
	`response_mode` text DEFAULT 'yes_no' NOT NULL,
	`button_labels` text,
	`nudge_enabled` integer DEFAULT false NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chats_telegram_chat_id_idx` ON `chats` (`telegram_chat_id`);
--> statement-breakpoint
CREATE TABLE `members` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`telegram_user_id` text NOT NULL,
	`username` text,
	`display_name` text NOT NULL,
	`timezone_override` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `members_telegram_user_id_idx` ON `members` (`telegram_user_id`);
--> statement-breakpoint
CREATE TABLE `chat_members` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`chat_id` integer NOT NULL,
	`member_id` integer NOT NULL,
	`joined_at` text DEFAULT (datetime('now')) NOT NULL,
	`left_at` text,
	`active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chat_members_chat_member_idx` ON `chat_members` (`chat_id`,`member_id`);
--> statement-breakpoint
CREATE INDEX `chat_members_chat_active_idx` ON `chat_members` (`chat_id`,`active`);
--> statement-breakpoint
CREATE TABLE `daily_windows` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`chat_id` integer NOT NULL,
	`checkin_date` text NOT NULL,
	`message_id` integer,
	`window_opens_at` text NOT NULL,
	`window_closes_at` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `daily_windows_chat_date_idx` ON `daily_windows` (`chat_id`,`checkin_date`);
--> statement-breakpoint
CREATE INDEX `daily_windows_status_idx` ON `daily_windows` (`status`);
--> statement-breakpoint
CREATE TABLE `checkins` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`daily_window_id` integer NOT NULL,
	`chat_id` integer NOT NULL,
	`member_id` integer NOT NULL,
	`checkin_date` text NOT NULL,
	`status` text NOT NULL,
	`note` text,
	`answered_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`daily_window_id`) REFERENCES `daily_windows`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `checkins_window_member_idx` ON `checkins` (`daily_window_id`,`member_id`);
--> statement-breakpoint
CREATE INDEX `checkins_chat_date_idx` ON `checkins` (`chat_id`,`checkin_date`);
