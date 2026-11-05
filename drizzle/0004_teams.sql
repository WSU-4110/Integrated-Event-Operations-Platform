CREATE TABLE "discord_bot"."lft_profiles" (
	"participant_link_id" integer PRIMARY KEY NOT NULL,
	"skills" text[] DEFAULT '{}'::text[] NOT NULL,
	"blurb" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discord_bot"."team_join_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"participant_link_id" integer NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_join_requests_kind_check" CHECK (kind IN ('REQUEST', 'INVITE')),
	CONSTRAINT "team_join_requests_status_check" CHECK (status IN ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED'))
);
--> statement-breakpoint
CREATE TABLE "discord_bot"."team_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"participant_link_id" integer NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_members_participant_link_unique" UNIQUE("participant_link_id")
);
--> statement-breakpoint
CREATE TABLE "discord_bot"."teams" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"skills_needed" text[] DEFAULT '{}'::text[] NOT NULL,
	"owner_link_id" integer NOT NULL,
	"discord_role_id" text,
	"discord_channel_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "discord_bot"."lft_profiles" ADD CONSTRAINT "lft_profiles_participant_link_id_participant_links_id_fk" FOREIGN KEY ("participant_link_id") REFERENCES "discord_bot"."participant_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_bot"."team_join_requests" ADD CONSTRAINT "team_join_requests_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "discord_bot"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_bot"."team_join_requests" ADD CONSTRAINT "team_join_requests_participant_link_id_participant_links_id_fk" FOREIGN KEY ("participant_link_id") REFERENCES "discord_bot"."participant_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_bot"."team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "discord_bot"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_bot"."team_members" ADD CONSTRAINT "team_members_participant_link_id_participant_links_id_fk" FOREIGN KEY ("participant_link_id") REFERENCES "discord_bot"."participant_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_bot"."teams" ADD CONSTRAINT "teams_owner_link_id_participant_links_id_fk" FOREIGN KEY ("owner_link_id") REFERENCES "discord_bot"."participant_links"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "team_join_requests_pending_unique" ON "discord_bot"."team_join_requests" USING btree ("team_id","participant_link_id") WHERE status = 'PENDING';--> statement-breakpoint
CREATE INDEX "team_join_requests_link_status_idx" ON "discord_bot"."team_join_requests" USING btree ("participant_link_id","status");--> statement-breakpoint
CREATE INDEX "team_members_team_idx" ON "discord_bot"."team_members" USING btree ("team_id","joined_at");--> statement-breakpoint
CREATE UNIQUE INDEX "teams_name_lower_unique" ON "discord_bot"."teams" USING btree (lower("name"));