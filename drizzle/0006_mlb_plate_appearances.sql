CREATE TABLE `mlb_plate_appearances` (
	`game_pk` int NOT NULL,
	`at_bat_index` int NOT NULL,
	`season` int NOT NULL,
	`official_date` date NOT NULL,
	`inning` int NOT NULL,
	`half_inning` varchar(8) NOT NULL,
	`batting_team_id` int NOT NULL,
	`batter_id` int NOT NULL,
	`pitcher_id` int NOT NULL,
	`pa_event` varchar(64),
	`pa_event_type` varchar(64),
	`is_complete` boolean,
	`outs_before` int,
	`outs_after` int,
	`bases_before` int,
	`bases_after` int,
	`runs_on_play` int,
	`earned_runs_on_play` int,
	CONSTRAINT `mlb_plate_appearances_pk` PRIMARY KEY(`game_pk`,`at_bat_index`)
);
--> statement-breakpoint
CREATE INDEX `mlb_pa_batter_idx` ON `mlb_plate_appearances` (`batter_id`,`season`);--> statement-breakpoint
CREATE INDEX `mlb_pa_pitcher_idx` ON `mlb_plate_appearances` (`pitcher_id`,`season`);--> statement-breakpoint
CREATE INDEX `mlb_pa_season_date_idx` ON `mlb_plate_appearances` (`season`,`official_date`);