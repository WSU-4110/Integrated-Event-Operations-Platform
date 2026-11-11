import { and, eq } from "drizzle-orm";
import { Router, type ErrorRequestHandler, type IRouter } from "express";
import { db, EVENT_ID, eventContentTable } from "@workspace/db";
import { prepareEventContent } from "../lib/eventContent";

export const organizerEventContent: IRouter = Router();
export const publicEventContent: IRouter = Router();

const table = eventContentTable;
const forEvent = eq(table.eventId, EVENT_ID);

organizerEventContent.get("/admin/event-content", async (_req, res) => {
  const items = await db
    .select()
    .from(table)
    .where(forEvent)
    .orderBy(table.kind, table.position, table.id);
  res.set("Cache-Control", "no-store").json(items);
});

organizerEventContent.post("/admin/event-content", async (req, res) => {
  const content = prepareEventContent(req.body);
  if (!content) {
    res
      .status(400)
      .json({
        error:
          "Enter a title and announcement text or a valid HTTP(S) link and position.",
      });
    return;
  }
  const [item] = await db
    .insert(table)
    .values({
      ...content,
      eventId: EVENT_ID,
      authorId: req.user!.id,
    })
    .returning();
  res.status(201).json(item);
});

organizerEventContent.put("/admin/event-content/:id", async (req, res) => {
  const id = Number(req.params.id);
  const content = prepareEventContent(req.body);
  if (!Number.isInteger(id) || id < 1 || id > 2_147_483_647 || !content) {
    res
      .status(400)
      .json({
        error:
          "Enter a valid item ID, title, and announcement text or resource link.",
      });
    return;
  }
  const [item] = await db
    .update(table)
    .set({ ...content, updatedAt: new Date() })
    .where(and(forEvent, eq(table.id, id)))
    .returning();
  if (!item) {
    res.status(404).json({ error: "Content item not found." });
    return;
  }
  res.json(item);
});

organizerEventContent.delete("/admin/event-content/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1 || id > 2_147_483_647) {
    res.status(400).json({ error: "Invalid item ID." });
    return;
  }
  const [deleted] = await db
    .delete(table)
    .where(and(forEvent, eq(table.id, id)))
    .returning({ id: table.id });
  if (!deleted) {
    res.status(404).json({ error: "Content item not found." });
    return;
  }
  res.status(204).end();
});

publicEventContent.get("/event-content", async (_req, res) => {
  const items = await db
    .select({
      id: table.id,
      kind: table.kind,
      title: table.title,
      body: table.body,
      url: table.url,
      position: table.position,
      updatedAt: table.updatedAt,
    })
    .from(table)
    .where(and(forEvent, eq(table.published, true)))
    .orderBy(table.kind, table.position, table.id);
  res.set("Cache-Control", "no-cache").json(items);
});

const handleEventContentError: ErrorRequestHandler = (
  error,
  req,
  res,
  next,
) => {
  if (res.headersSent) {
    next(error);
    return;
  }
  req.log.error({ err: error }, "Event content request failed");
  res.status(500).json({ error: "Could not save or load event content." });
};

organizerEventContent.use(handleEventContentError);
publicEventContent.use(handleEventContentError);
