CREATE TABLE `queued_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	`chat_session_id` text NOT NULL,
	`content` text NOT NULL,
	`attachments` text DEFAULT '[]' NOT NULL,
	`draft` text,
	`app_context` text,
	`api_key_id` text,
	FOREIGN KEY (`chat_session_id`) REFERENCES `chat_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_queued_messages_chat` ON `queued_messages` (`chat_session_id`,`id`);