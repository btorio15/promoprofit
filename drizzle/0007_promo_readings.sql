CREATE TABLE "promo_readings" (
	"content_hash" text PRIMARY KEY NOT NULL,
	"book_key" text NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"reading" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
