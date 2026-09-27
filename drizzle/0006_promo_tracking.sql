CREATE TABLE "promo_completions" (
	"user_id" integer NOT NULL,
	"promo_id" integer NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "promo_completions_user_id_promo_id_pk" PRIMARY KEY("user_id","promo_id")
);
--> statement-breakpoint
CREATE TABLE "promo_profit_observations" (
	"promo_id" integer NOT NULL,
	"denver_date" text NOT NULL,
	"book_key" text NOT NULL,
	"max_guaranteed_profit" numeric(10, 2) NOT NULL,
	"last_observed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "promo_profit_observations_promo_id_denver_date_pk" PRIMARY KEY("promo_id","denver_date")
);
--> statement-breakpoint
ALTER TABLE "promo_completions" ADD CONSTRAINT "promo_completions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_completions" ADD CONSTRAINT "promo_completions_promo_id_promos_id_fk" FOREIGN KEY ("promo_id") REFERENCES "public"."promos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_profit_observations" ADD CONSTRAINT "promo_profit_observations_promo_id_promos_id_fk" FOREIGN KEY ("promo_id") REFERENCES "public"."promos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_profit_observations" ADD CONSTRAINT "promo_profit_observations_book_key_books_key_fk" FOREIGN KEY ("book_key") REFERENCES "public"."books"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "promo_profit_observations_denver_date_idx" ON "promo_profit_observations" USING btree ("denver_date");