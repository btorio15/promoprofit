CREATE TABLE "bets" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"promo_id" integer,
	"hedge_group_id" text,
	"book_key" text NOT NULL,
	"sport_key" text,
	"event_id" text,
	"market" text,
	"side" text,
	"odds_american" integer NOT NULL,
	"stake" numeric(10, 2) NOT NULL,
	"placed_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"settled_at" timestamp with time zone,
	"payout" numeric(10, 2),
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "book_accounts" (
	"user_id" integer NOT NULL,
	"book_key" text NOT NULL,
	"opened_at" timestamp with time zone,
	"deposits_total" numeric(10, 2) DEFAULT '0' NOT NULL,
	"withdrawals_total" numeric(10, 2) DEFAULT '0' NOT NULL,
	"current_balance" numeric(10, 2),
	"balance_as_of" timestamp with time zone,
	"pending_withdrawal" numeric(10, 2) DEFAULT '0' NOT NULL,
	CONSTRAINT "book_accounts_user_id_book_key_pk" PRIMARY KEY("user_id","book_key")
);
--> statement-breakpoint
ALTER TABLE "promo_completions" ADD COLUMN "claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "promo_completions" ADD COLUMN "claim_status" text;--> statement-breakpoint
ALTER TABLE "promo_completions" ADD COLUMN "minutes_spent" integer;--> statement-breakpoint
ALTER TABLE "promos" ADD COLUMN "promo_category" text;--> statement-breakpoint
ALTER TABLE "bets" ADD CONSTRAINT "bets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bets" ADD CONSTRAINT "bets_promo_id_promos_id_fk" FOREIGN KEY ("promo_id") REFERENCES "public"."promos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bets" ADD CONSTRAINT "bets_book_key_books_key_fk" FOREIGN KEY ("book_key") REFERENCES "public"."books"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_accounts" ADD CONSTRAINT "book_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_accounts" ADD CONSTRAINT "book_accounts_book_key_books_key_fk" FOREIGN KEY ("book_key") REFERENCES "public"."books"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bets_user_placed_idx" ON "bets" USING btree ("user_id","placed_at");--> statement-breakpoint
CREATE INDEX "bets_hedge_group_idx" ON "bets" USING btree ("hedge_group_id");