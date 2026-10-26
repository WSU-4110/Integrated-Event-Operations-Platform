CREATE TABLE "discord_bot"."workshop_registrations" (
	"id" serial PRIMARY KEY NOT NULL,
	"workshop_id" integer NOT NULL,
	"participant_link_id" integer NOT NULL,
	"status" text NOT NULL,
	"registered_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workshop_registrations_workshop_link_unique" UNIQUE("workshop_id","participant_link_id"),
	CONSTRAINT "workshop_registrations_status_check" CHECK (status IN ('REGISTERED', 'WAITLISTED', 'CANCELLED'))
);
--> statement-breakpoint
CREATE TABLE "discord_bot"."workshops" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"speaker" text,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone NOT NULL,
	"location" text NOT NULL,
	"capacity" integer NOT NULL,
	"channel_id" text,
	"message_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workshops_name_unique" UNIQUE("name"),
	CONSTRAINT "workshops_capacity_check" CHECK (capacity > 0),
	CONSTRAINT "workshops_time_check" CHECK (end_time > start_time)
);
--> statement-breakpoint
ALTER TABLE "discord_bot"."workshop_registrations" ADD CONSTRAINT "workshop_registrations_workshop_id_workshops_id_fk" FOREIGN KEY ("workshop_id") REFERENCES "discord_bot"."workshops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_bot"."workshop_registrations" ADD CONSTRAINT "workshop_registrations_participant_link_id_participant_links_id_fk" FOREIGN KEY ("participant_link_id") REFERENCES "discord_bot"."participant_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workshop_registrations_workshop_status_idx" ON "discord_bot"."workshop_registrations" USING btree ("workshop_id","status","registered_at");