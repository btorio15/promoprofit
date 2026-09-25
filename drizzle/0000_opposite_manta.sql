CREATE TABLE "books" (
	"key" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"region" text,
	"api_coverage" boolean NOT NULL,
	"tier" text NOT NULL,
	"sort_order" integer NOT NULL,
	"note" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cached_odds" (
	"event_id" text PRIMARY KEY NOT NULL,
	"sport_key" text NOT NULL,
	"commence_time" timestamp with time zone NOT NULL,
	"raw_response" jsonb NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_usage" (
	"id" serial PRIMARY KEY NOT NULL,
	"requests_remaining" integer NOT NULL,
	"requests_used" integer NOT NULL,
	"refresh_cost" integer NOT NULL,
	"sports_fetched" integer NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "cached_odds_sport_key_idx" ON "cached_odds" USING btree ("sport_key");--> statement-breakpoint
CREATE INDEX "cached_odds_commence_time_idx" ON "cached_odds" USING btree ("commence_time");