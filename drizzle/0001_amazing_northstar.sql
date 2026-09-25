CREATE TABLE "refresh_lock" (
	"id" integer PRIMARY KEY NOT NULL,
	"holder" text NOT NULL,
	"locked_until" timestamp with time zone NOT NULL
);
