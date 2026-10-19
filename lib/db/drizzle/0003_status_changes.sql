CREATE TABLE "registration_status_changes" (
	"id" serial PRIMARY KEY NOT NULL,
	"registration_id" integer NOT NULL,
	"from_status" text NOT NULL,
	"to_status" text NOT NULL,
	"changed_by_user_id" text NOT NULL,
	"changed_by_email" text NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "registrations" ADD COLUMN "status_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "registration_status_changes" ADD CONSTRAINT "registration_status_changes_registration_id_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "status_changes_registration_idx" ON "registration_status_changes" USING btree ("registration_id");