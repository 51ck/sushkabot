ALTER TABLE `daily_windows` ADD `live_body` text;--> statement-breakpoint
ALTER TABLE `daily_windows` ADD `live_body_at` text;--> statement-breakpoint
CREATE TABLE `bot_posts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`chat_id` integer NOT NULL,
	`telegram_message_id` integer NOT NULL,
	`kind` text NOT NULL,
	`daily_window_id` integer,
	`posted_at` text DEFAULT (datetime('now')) NOT NULL,
	`has_reply` integer DEFAULT false NOT NULL,
	`delete_after` text,
	`deleted_at` text,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`daily_window_id`) REFERENCES `daily_windows`(`id`) ON UPDATE no action ON DELETE set null
);--> statement-breakpoint
CREATE UNIQUE INDEX `bot_posts_chat_message_idx` ON `bot_posts` (`chat_id`,`telegram_message_id`);--> statement-breakpoint
CREATE INDEX `bot_posts_chat_kind_idx` ON `bot_posts` (`chat_id`,`kind`);--> statement-breakpoint
CREATE INDEX `bot_posts_delete_after_idx` ON `bot_posts` (`delete_after`);--> statement-breakpoint
CREATE TABLE `chat_snippets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`chat_id` integer NOT NULL,
	`telegram_message_id` integer NOT NULL,
	`author_name` text NOT NULL,
	`text` text NOT NULL,
	`posted_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX `chat_snippets_chat_posted_idx` ON `chat_snippets` (`chat_id`,`posted_at`);--> statement-breakpoint
CREATE TABLE `llm_generations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`chat_id` integer NOT NULL,
	`kind` text NOT NULL,
	`text` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX `llm_generations_chat_created_idx` ON `llm_generations` (`chat_id`,`created_at`);
