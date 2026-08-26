CREATE TABLE `scoutingNotes` (
	`id` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`type` varchar(32) NOT NULL,
	`player` varchar(255) NOT NULL,
	`team` varchar(128),
	`pos` varchar(64),
	`pinned` boolean NOT NULL DEFAULT false,
	`text` longtext,
	`summary` longtext,
	`isPitcher` boolean NOT NULL DEFAULT false,
	`grades` longtext,
	`fv` varchar(32),
	`risk` varchar(32),
	`eta` varchar(32),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`deletedAt` timestamp,
	CONSTRAINT `scoutingNotes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `scouting_notes_user_idx` ON `scoutingNotes` (`userId`);--> statement-breakpoint
CREATE INDEX `scouting_notes_updated_idx` ON `scoutingNotes` (`updatedAt`);