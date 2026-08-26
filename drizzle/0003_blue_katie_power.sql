CREATE TABLE `uptime_monitor_checks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`endpoint` varchar(512) NOT NULL,
	`status_code` int NOT NULL,
	`latency_ms` int NOT NULL,
	`passed` boolean NOT NULL,
	`checked_at` timestamp NOT NULL,
	`run_key` varchar(96) NOT NULL,
	CONSTRAINT `uptime_monitor_checks_id` PRIMARY KEY(`id`),
	CONSTRAINT `uptime_monitor_endpoint_run_idx` UNIQUE(`endpoint`,`run_key`)
);
--> statement-breakpoint
CREATE TABLE `uptime_monitor_schedules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(96) NOT NULL,
	`schedule_cron_task_uid` varchar(65),
	`cron_expression` varchar(64) NOT NULL,
	`enabled` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `uptime_monitor_schedules_id` PRIMARY KEY(`id`),
	CONSTRAINT `uptime_monitor_schedules_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE INDEX `uptime_monitor_endpoint_checked_idx` ON `uptime_monitor_checks` (`endpoint`,`checked_at`);--> statement-breakpoint
CREATE INDEX `uptime_monitor_task_uid_idx` ON `uptime_monitor_schedules` (`schedule_cron_task_uid`);