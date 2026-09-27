ALTER TABLE "promos" ADD COLUMN "scope_kind" text;--> statement-breakpoint
ALTER TABLE "promos" ADD COLUMN "window_start" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "promos" ADD COLUMN "window_end" timestamp with time zone;