CREATE TABLE IF NOT EXISTS "event_schedule" (
    "id" serial PRIMARY KEY NOT NULL,
    "event_id" text NOT NULL,
    "title" text NOT NULL,
    "description" text,
    "location" text,
    "start_time" timestamp with time zone NOT NULL,
    "end_time" timestamp with time zone NOT NULL,
    "published" boolean DEFAULT false NOT NULL,
    "position" integer NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "event_schedule_listing_idx"
ON "event_schedule" ("event_id", "published", "start_time");
