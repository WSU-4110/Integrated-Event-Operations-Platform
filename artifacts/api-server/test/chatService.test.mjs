import assert from "node:assert/strict";
import test from "node:test";
import { ChatService } from "../src/lib/chat/chatService.ts";

const messages = [{ role: "user", content: "When do doors lock?" }];

// A fake AiProvider: no network, no API key.
const fakeProvider = (complete) => ({ complete });

test("returns the provider's reply and passes the prompt and messages through", async () => {
  let received;
  const service = new ChatService({
    provider: fakeProvider(async (request) => {
      received = request;
      return "8:00 PM Saturday.";
    }),
    systemPrompt: "SYSTEM",
    fallbackReply: "FALLBACK",
  });

  assert.deepEqual(await service.answer(messages), {
    reply: "8:00 PM Saturday.",
    fallback: false,
  });
  assert.deepEqual(received, { system: "SYSTEM", messages });
});

test("returns the fallback reply and reports the error when the provider fails", async () => {
  const failure = new Error("provider down");
  const reported = [];
  const service = new ChatService({
    provider: fakeProvider(async () => {
      throw failure;
    }),
    systemPrompt: "SYSTEM",
    fallbackReply: "Email awssbg@wayne.edu.",
    onError: (error) => reported.push(error),
  });

  assert.deepEqual(await service.answer(messages), {
    reply: "Email awssbg@wayne.edu.",
    fallback: true,
  });
  assert.deepEqual(reported, [failure]);
});

test("does not need an onError handler", async () => {
  const service = new ChatService({
    provider: fakeProvider(async () => {
      throw new Error("provider down");
    }),
    systemPrompt: "SYSTEM",
    fallbackReply: "FALLBACK",
  });
  assert.equal((await service.answer(messages)).fallback, true);
});
