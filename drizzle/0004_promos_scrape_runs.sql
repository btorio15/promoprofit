CREATE TABLE "promos" (
	"id" serial PRIMARY KEY NOT NULL,
	"book_key" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"promo_type" text NOT NULL,
	"status" text NOT NULL,
	"review_reason" text,
	"auto_matched" boolean DEFAULT false NOT NULL,
	"auto_match_blocked" boolean DEFAULT false NOT NULL,
	"sport_key" text,
	"event_id" text,
	"event_commence_time" timestamp with time zone,
	"home_team" text,
	"away_team" text,
	"market_type" text,
	"line" double precision,
	"side" text,
	"best_guess" jsonb,
	"parsed" jsonb NOT NULL,
	"boost_percent" numeric(7, 2),
	"boosted_odds_american" integer,
	"base_odds_american" integer,
	"bonus_amount" numeric(10, 2),
	"max_stake" numeric(10, 2),
	"max_winnings" numeric(10, 2),
	"max_winnings_kind" text,
	"min_odds_american" integer,
	"unparsed_cap_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"fine_print_note" text,
	"raw_text" text NOT NULL,
	"source_url" text NOT NULL,
	"expires_at" timestamp with time zone,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"confirmed_by_user_id" integer,
	"corrected_by_user_id" integer,
	"cap_entered_by_user_id" integer,
	"dismissed_by_user_id" integer,
	"flagged_by_user_id" integer,
	"reviewed_at" timestamp with time zone,
	CONSTRAINT "promos_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "scrape_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"book_key" text NOT NULL,
	"ran_at" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"promos_found" integer NOT NULL,
	"promos_kept" integer NOT NULL,
	"error_message" text
);
--> statement-breakpoint
ALTER TABLE "promos" ADD CONSTRAINT "promos_book_key_books_key_fk" FOREIGN KEY ("book_key") REFERENCES "public"."books"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promos" ADD CONSTRAINT "promos_confirmed_by_user_id_users_id_fk" FOREIGN KEY ("confirmed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promos" ADD CONSTRAINT "promos_corrected_by_user_id_users_id_fk" FOREIGN KEY ("corrected_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promos" ADD CONSTRAINT "promos_cap_entered_by_user_id_users_id_fk" FOREIGN KEY ("cap_entered_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promos" ADD CONSTRAINT "promos_dismissed_by_user_id_users_id_fk" FOREIGN KEY ("dismissed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promos" ADD CONSTRAINT "promos_flagged_by_user_id_users_id_fk" FOREIGN KEY ("flagged_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrape_runs" ADD CONSTRAINT "scrape_runs_book_key_books_key_fk" FOREIGN KEY ("book_key") REFERENCES "public"."books"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "promos_status_idx" ON "promos" USING btree ("status");--> statement-breakpoint
CREATE INDEX "promos_book_key_idx" ON "promos" USING btree ("book_key");--> statement-breakpoint
CREATE INDEX "scrape_runs_book_key_ran_at_idx" ON "scrape_runs" USING btree ("book_key","ran_at");