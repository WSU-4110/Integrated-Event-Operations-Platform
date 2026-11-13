
import { and, asc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { db, EVENT_ID, eventScheduleTable } from "@workspace/db";

export const publicEventSchedule: IRouter = Router();

publicEventSchedule.get("/event-schedule", async (_req, res) => {
  try {
    const items = await db
      .select()
      .from(eventScheduleTable)
      .where(
        and(
          eq(eventScheduleTable.eventId, EVENT_ID),
          eq(eventScheduleTable.published, true),
        ),
      )
      .orderBy(asc(eventScheduleTable.startTime));

    res.set("Cache-Control", "no-cache").json(items);
  } catch (error) {
    console.error("Failed to load event schedule:", error);
    res.status(500).json({
      error: "Could not load event schedule.",
    });
  }
});
