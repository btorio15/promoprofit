CREATE TABLE "signup_offers" (
	"id" serial PRIMARY KEY NOT NULL,
	"book_key" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"external_id" text,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"raw_text" text NOT NULL,
	"bonus_amount" numeric(10, 2),
	"source_url" text NOT NULL,
	"expires_at" timestamp with time zone,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	CONSTRAINT "signup_offers_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
ALTER TABLE "signup_offers" ADD CONSTRAINT "signup_offers_book_key_books_key_fk" FOREIGN KEY ("book_key") REFERENCES "public"."books"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "signup_offers_status_idx" ON "signup_offers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "signup_offers_book_key_idx" ON "signup_offers" USING btree ("book_key");