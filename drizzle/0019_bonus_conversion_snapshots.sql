CREATE TABLE "bonus_conversion_snapshots" (
	"book_key" text NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"denver_date" text NOT NULL,
	"denver_hour" integer NOT NULL,
	"reference_amount" numeric(10, 2) NOT NULL,
	"candidate_count" integer NOT NULL,
	"top_n_count" integer NOT NULL,
	"top_profit" numeric(10, 2),
	"top_pct" numeric(6, 2),
	"median_top_pct" numeric(7, 3),
	"top_event_id" text,
	"top_sport_key" text,
	"top_hedge_book_key" text,
	CONSTRAINT "bonus_conversion_snapshots_book_key_captured_at_pk" PRIMARY KEY("book_key","captured_at")
);
--> statement-breakpoint
ALTER TABLE "bonus_conversion_snapshots" ADD CONSTRAINT "bonus_conversion_snapshots_book_key_books_key_fk" FOREIGN KEY ("book_key") REFERENCES "public"."books"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bonus_conversion_snapshots_captured_at_idx" ON "bonus_conversion_snapshots" USING btree ("captured_at");