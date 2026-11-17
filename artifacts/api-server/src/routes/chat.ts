import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Router, type IRouter, type Request } from "express";
import { logger } from "../lib/logger";
import { AnthropicProvider } from "../lib/chat/anthropicProvider";
import { ChatService } from "../lib/chat/chatService";
import { HELP_EMAIL, buildSystemPrompt } from "../lib/chat/prompt";
import { createRateLimiter } from "../lib/chat/rateLimiter";
import { validateMessages } from "../lib/chat/validation";

// Relative to the bundled server file (artifacts/api-server/dist/index.mjs),
// like the information packet PDF path in registrationConfirmationEmail.ts.
const packetPath = fileURLToPath(
  new URL(
    "../../../attached_assets/BuilderWars_Information_Packet.txt",
    import.meta.url,
  ),
);

const UNAVAILABLE = `Sorry, I can't answer right now. Please email ${HELP_EMAIL} or ask an organizer.`;

// 15 messages per minute for each visitor, 200 per minute for everyone, so a
// flood can't run up the AI bill.
const perVisitor = createRateLimiter({ limit: 15, windowMs: 60_000 });
const overall = createRateLimiter({ limit: 200, windowMs: 60_000 });

let service: ChatService | undefined;

// Built on the first request so a missing API key or packet file can't stop
// the rest of the site from starting.
function getService(): ChatService | null {
  if (service) return service;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    logger.warn("ANTHROPIC_API_KEY is not set; the chatbot is unavailable.");
    return null;
  }
  service = new ChatService({
    provider: new AnthropicProvider({
      apiKey,
      model: process.env.ANTHROPIC_MODEL || undefined,
    }),
    systemPrompt: buildSystemPrompt(readFileSync(packetPath, "utf8")),
    fallbackReply: UNAVAILABLE,
    // Log the error only, never the participant's message.
    onError: (error) => logger.error({ err: error }, "Chat provider failed"),
  });
  return service;
}

// Behind the host's load balancer every request shares one socket address, so
// use the address the balancer appended to X-Forwarded-For (the last entry).
function visitorKey(req: Request): string {
  const header = req.headers["x-forwarded-for"];
  const value = Array.isArray(header) ? header[header.length - 1] : header;
  return value?.split(",").pop()?.trim() || req.ip || "unknown";
}

const router: IRouter = Router();

router.post("/chat", async (req, res) => {
  if (!perVisitor.allow(visitorKey(req)) || !overall.allow("all")) {
    res
      .status(429)
      .json({ error: "Too many messages. Please wait a minute and try again." });
    return;
  }

  const validation = validateMessages(req.body?.messages);
  if (!validation.ok) {
    res.status(400).json({ error: validation.error });
    return;
  }

  let chat: ChatService | null = null;
  try {
    chat = getService();
  } catch (error) {
    logger.error({ err: error }, "Chat setup failed");
  }
  if (!chat) {
    res.status(503).json({ error: UNAVAILABLE });
    return;
  }

  const { reply } = await chat.answer(validation.messages);
  res.json({ reply });
});

export default router;
