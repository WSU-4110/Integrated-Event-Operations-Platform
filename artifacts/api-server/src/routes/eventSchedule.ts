import { and, asc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { db, EVENT_ID, eventScheduleTable as table } from "@workspace/db";

export const publicEventSchedule: IRouter = Router();

// FR-12: the published schedule for this event, in time order. Unpublished
// sessions and internal fields (event ID, published flag) stay private.
publicEventSchedule.get("/event-schedule", async (req, res) => {
  try {
    const items = await db
      .select({
        id: table.id,
        title: table.title,
        description: table.description,
        location: table.location,
        startTime: table.startTime,
        endTime: table.endTime,
        position: table.position,
      })
      .from(table)
      .where(and(eq(table.eventId, EVENT_ID), eq(table.published, true)))
      .orderBy(asc(table.startTime), asc(table.position), asc(table.id));
    res.set("Cache-Control", "no-cache").json(items);
  } catch (error) {
    req.log.error({ err: error }, "Could not load the event schedule");
    res.status(500).json({ error: "Could not load event schedule." });
  }
});
