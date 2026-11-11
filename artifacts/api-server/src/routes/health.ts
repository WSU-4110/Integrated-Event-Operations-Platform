import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { getConfirmationEmailStatus } from "../lib/registrationConfirmationEmail";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

async function isReachable(query: string): Promise<boolean> {
  try {
    const probe = { text: query, query_timeout: 2000 };
    await pool.query(probe);
    return true;
  } catch {
    return false;
  }
}

router.get("/status", async (_req, res) => {
  const databaseUp = await isReachable("SELECT 1");
  const discordLinkStore = databaseUp
    ? (await isReachable("SELECT 1 FROM discord_bot.participant_links LIMIT 1"))
      ? "up"
      : "unavailable"
    : "unknown";

  res
    .status(databaseUp ? 200 : 503)
    .set("Cache-Control", "no-store")
    .json({
      web: "up",
      database: databaseUp ? "up" : "unavailable",
      discordLinkStore,
      confirmationEmail: getConfirmationEmailStatus(),
    });
});

export default router;
