CREATE TABLE "profit_snapshots" (
	"promo_id" integer NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"denver_date" text NOT NULL,
	"denver_hour" integer NOT NULL,
	"sport_key" text NOT NULL,
	"game_at" timestamp with time zone,
	"book_key" text NOT NULL,
	"guaranteed_profit" numeric(10, 2) NOT NULL,
	CONSTRAINT "profit_snapshots_promo_id_captured_at_pk" PRIMARY KEY("promo_id","captured_at")
);
--> statement-breakpoint
ALTER TABLE "profit_snapshots" ADD CONSTRAINT "profit_snapshots_promo_id_promos_id_fk" FOREIGN KEY ("promo_id") REFERENCES "public"."promos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profit_snapshots" ADD CONSTRAINT "profit_snapshots_book_key_books_key_fk" FOREIGN KEY ("book_key") REFERENCES "public"."books"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "profit_snapshots_captured_at_idx" ON "profit_snapshots" USING btree ("captured_at");--> statement-breakpoint
CREATE INDEX "profit_snapshots_sport_game_idx" ON "profit_snapshots" USING btree ("sport_key","game_at");