CREATE TABLE `apiResponseCache` (
	`id` int AUTO_INCREMENT NOT NULL,
	`cacheKey` varchar(512) NOT NULL,
	`source` varchar(128) NOT NULL,
	`payload` longtext NOT NULL,
	`freshUntil` timestamp NOT NULL,
	`staleUntil` timestamp NOT NULL,
	`lastAttemptDay` varchar(10),
	`failureUntil` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `apiResponseCache_id` PRIMARY KEY(`id`),
	CONSTRAINT `apiResponseCache_cacheKey_unique` UNIQUE(`cacheKey`)
);
