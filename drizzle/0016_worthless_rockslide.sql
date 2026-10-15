CREATE TABLE "user_book_caps" (
	"user_id" integer NOT NULL,
	"book_key" text NOT NULL,
	"max_stake" numeric(10, 2) NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "user_book_caps_user_id_book_key_pk" PRIMARY KEY("user_id","book_key")
);
--> statement-breakpoint
ALTER TABLE "user_book_caps" ADD CONSTRAINT "user_book_caps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_book_caps" ADD CONSTRAINT "user_book_caps_book_key_books_key_fk" FOREIGN KEY ("book_key") REFERENCES "public"."books"("key") ON DELETE no action ON UPDATE no action;