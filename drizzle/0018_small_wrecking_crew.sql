CREATE TABLE "tracked_no_sweats" (
	"user_id" integer NOT NULL,
	"promo_id" integer NOT NULL,
	"state" text NOT NULL,
	"tracked_at" timestamp with time zone NOT NULL,
	"outcome" text,
	"outcome_at" timestamp with time zone,
	"correction" jsonb,
	"snapshot" jsonb NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "tracked_no_sweats_user_id_promo_id_pk" PRIMARY KEY("user_id","promo_id")
);
--> statement-breakpoint
CREATE TABLE "user_low_profile_settings" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"odds_cap_enabled" boolean DEFAULT true NOT NULL,
	"odds_cap_american" integer DEFAULT 300 NOT NULL,
	"main_lines_only" boolean DEFAULT false NOT NULL,
	"natural_stakes" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tracked_no_sweats" ADD CONSTRAINT "tracked_no_sweats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracked_no_sweats" ADD CONSTRAINT "tracked_no_sweats_promo_id_promos_id_fk" FOREIGN KEY ("promo_id") REFERENCES "public"."promos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_low_profile_settings" ADD CONSTRAINT "user_low_profile_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;