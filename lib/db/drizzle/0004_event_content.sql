CREATE TABLE "event_content" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"url" text,
	"position" integer NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"author_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "event_content_listing_idx" ON "event_content" USING btree ("event_id","published","kind","position","id");