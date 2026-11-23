ALTER TABLE `user_state` RENAME COLUMN "orchestrator_name" TO "coordinator_name";--> statement-breakpoint
ALTER TABLE `user_state` RENAME COLUMN "orchestrator_emoji" TO "coordinator_emoji";--> statement-breakpoint
ALTER TABLE `user_state` RENAME COLUMN "orchestrator_image" TO "coordinator_image";--> statement-breakpoint
ALTER TABLE `user_state` RENAME COLUMN "orchestrator_color" TO "coordinator_color";--> statement-breakpoint
ALTER TABLE `user_state` RENAME COLUMN "orchestrator_introduced_at" TO "coordinator_introduced_at";--> statement-breakpoint
ALTER TABLE `user_state` DROP COLUMN `orchestrator_mode`;--> statement-breakpoint
UPDATE `triggers` SET `target_kind` = 'coordinator' WHERE `target_kind` = 'orchestrator';--> statement-breakpoint
UPDATE `chat_sessions` SET `type` = 'coordinator' WHERE `type` = 'orchestration';--> statement-breakpoint
UPDATE `agent_coordination_requests` SET `source_address` = 'coordinator' WHERE `source_address` = 'orchestrator';--> statement-breakpoint
UPDATE `agent_coordination_requests` SET `target_address` = 'coordinator' WHERE `target_address` = 'orchestrator';--> statement-breakpoint
UPDATE `agent_coordination_deliveries` SET `target_address` = 'coordinator' WHERE `target_address` = 'orchestrator';
