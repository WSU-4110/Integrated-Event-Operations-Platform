CREATE TABLE "discord_bot"."events" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone,
	"location" text,
	"type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_time_check" CHECK (end_time IS NULL OR end_time > start_time),
	CONSTRAINT "events_type_check" CHECK (type IN ('GENERAL', 'WORKSHOP', 'MENTOR', 'FOOD', 'DEADLINE', 'JUDGING'))
);
--> statement-breakpoint
CREATE TABLE "discord_bot"."announcements" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"type" text NOT NULL,
	"ping_participants" boolean DEFAULT false NOT NULL,
	"scheduled_for" timestamp with time zone,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"created_by" text NOT NULL,
	"channel_id" text,
	"message_id" text,
	"sent_at" timestamp with time zone,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "announcements_type_check" CHECK (type IN ('GENERAL', 'IMPORTANT', 'WORKSHOP', 'REMINDER', 'FOOD', 'DEADLINE')),
	CONSTRAINT "announcements_status_check" CHECK (status IN ('DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'FAILED', 'CANCELLED'))
);
--> statement-breakpoint
CREATE INDEX "events_start_time_idx" ON "discord_bot"."events" USING btree ("start_time");--> statement-breakpoint
CREATE INDEX "announcements_status_scheduled_idx" ON "discord_bot"."announcements" USING btree ("status","scheduled_for");