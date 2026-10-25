-- The discord_bot schema is created by the database admin;
-- the bot role cannot create schemas, so drizzle-kit's CREATE SCHEMA was removed.
CREATE TABLE "discord_bot"."participant_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"discord_user_id" text NOT NULL,
	"registration_id" integer NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"linked_by" text,
	"active" boolean DEFAULT true NOT NULL,
	"checked_in" boolean DEFAULT false NOT NULL,
	"checked_in_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "participant_links_discord_user_id_unique" UNIQUE("discord_user_id"),
	CONSTRAINT "participant_links_registration_id_unique" UNIQUE("registration_id")
);
--> statement-breakpoint
CREATE TABLE "discord_bot"."verification_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"discord_user_id" text NOT NULL,
	"discord_username" text NOT NULL,
	"result" text NOT NULL,
	"registration_id" integer,
	"resolved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verification_attempts_result_check" CHECK (result IN ('MATCHED', 'NO_MATCH', 'INELIGIBLE', 'AMBIGUOUS', 'ALREADY_LINKED', 'RATE_LIMITED'))
);
--> statement-breakpoint
CREATE INDEX "verification_attempts_user_created_idx" ON "discord_bot"."verification_attempts" USING btree ("discord_user_id","created_at");