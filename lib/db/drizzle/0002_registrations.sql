CREATE TABLE "registrations" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" text DEFAULT 'builderwars-2026' NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"school" text NOT NULL,
	"class_standing" text NOT NULL,
	"experience_level" text NOT NULL,
	"discord_username" text,
	"team_status" text,
	"team_name" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"source" text DEFAULT 'website' NOT NULL,
	"confirmation_email_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "registrations_event_email_unique" UNIQUE("event_id","email")
);
