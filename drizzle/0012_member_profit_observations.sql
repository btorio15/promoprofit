CREATE TABLE "member_profit_observations" (
	"user_id" integer NOT NULL,
	"promo_id" integer NOT NULL,
	"denver_date" text NOT NULL,
	"book_key" text NOT NULL,
	"profit" numeric(10, 2) NOT NULL,
	"partner_promo_id" integer,
	"last_observed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "member_profit_observations_user_id_promo_id_denver_date_pk" PRIMARY KEY("user_id","promo_id","denver_date")
);
--> statement-breakpoint
ALTER TABLE "member_profit_observations" ADD CONSTRAINT "member_profit_observations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_profit_observations" ADD CONSTRAINT "member_profit_observations_promo_id_promos_id_fk" FOREIGN KEY ("promo_id") REFERENCES "public"."promos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_profit_observations" ADD CONSTRAINT "member_profit_observations_book_key_books_key_fk" FOREIGN KEY ("book_key") REFERENCES "public"."books"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "member_profit_observations_user_date_idx" ON "member_profit_observations" USING btree ("user_id","denver_date");