CREATE TABLE "cached_extended_odds" (
	"event_id" text PRIMARY KEY NOT NULL,
	"sport_key" text NOT NULL,
	"commence_time" timestamp with time zone NOT NULL,
	"raw_response" jsonb NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "cached_extended_odds_sport_key_idx" ON "cached_extended_odds" USING btree ("sport_key");--> statement-breakpoint
CREATE INDEX "cached_extended_odds_commence_time_idx" ON "cached_extended_odds" USING btree ("commence_time");