ALTER TABLE "promos" ADD COLUMN "added_by_user_id" integer;--> statement-breakpoint
ALTER TABLE "promos" ADD CONSTRAINT "promos_added_by_user_id_users_id_fk" FOREIGN KEY ("added_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "promos_added_by_user_id_idx" ON "promos" USING btree ("added_by_user_id");