CREATE TABLE "user_promo_caps" (
	"user_id" integer NOT NULL,
	"promo_id" integer NOT NULL,
	"max_stake" numeric(10, 2) NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "user_promo_caps_user_id_promo_id_pk" PRIMARY KEY("user_id","promo_id")
);
--> statement-breakpoint
ALTER TABLE "user_promo_caps" ADD CONSTRAINT "user_promo_caps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_promo_caps" ADD CONSTRAINT "user_promo_caps_promo_id_promos_id_fk" FOREIGN KEY ("promo_id") REFERENCES "public"."promos"("id") ON DELETE cascade ON UPDATE no action;