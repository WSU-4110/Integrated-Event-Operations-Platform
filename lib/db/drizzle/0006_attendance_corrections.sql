CREATE TABLE "attendance_corrections" (
	"id" serial PRIMARY KEY NOT NULL,
	"registration_id" integer NOT NULL,
	"event_id" text NOT NULL,
	"reason" text NOT NULL,
	"original_checked_in_at" timestamp with time zone NOT NULL,
	"original_checked_in_by" text,
	"corrected_by" text NOT NULL,
	"corrected_by_email" text NOT NULL,
	"corrected_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	"attendance_version" integer NOT NULL,
	CONSTRAINT "attendance_correction_reason_required" CHECK (length(btrim("attendance_corrections"."reason")) between 1 and 1000)
);
--> statement-breakpoint
ALTER TABLE "registrations" ADD COLUMN "attendance_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_registration_id_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attendance_corrections_registration_idx" ON "attendance_corrections" USING btree ("registration_id","id");