CREATE TABLE "verification_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"registration_id" integer NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"invalidated_at" timestamp with time zone,
	"email_sent_at" timestamp with time zone,
	"email_failed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "verification_codes" ADD CONSTRAINT "verification_codes_registration_id_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "verification_codes_one_unused_idx" ON "verification_codes" USING btree ("registration_id") WHERE "verification_codes"."used_at" is null and "verification_codes"."invalidated_at" is null;--> statement-breakpoint
CREATE INDEX "verification_codes_registration_idx" ON "verification_codes" USING btree ("registration_id");