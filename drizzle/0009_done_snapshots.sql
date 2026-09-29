ALTER TABLE "promo_completions" ADD COLUMN "snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "promo_completions" ADD COLUMN "profit_extracted" numeric(10, 2) DEFAULT '0' NOT NULL;