CREATE TABLE `apiCacheTelemetry` (
	`id` int AUTO_INCREMENT NOT NULL,
	`telemetryKey` varchar(256) NOT NULL,
	`provider` varchar(128) NOT NULL,
	`outcome` varchar(32) NOT NULL,
	`day` varchar(10) NOT NULL,
	`count` int NOT NULL DEFAULT 0,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `apiCacheTelemetry_id` PRIMARY KEY(`id`),
	CONSTRAINT `apiCacheTelemetry_telemetryKey_unique` UNIQUE(`telemetryKey`)
);
