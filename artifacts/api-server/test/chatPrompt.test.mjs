import assert from "node:assert/strict";
import test from "node:test";
import {
  HELP_EMAIL,
  SECURITY_PHONE,
  buildSystemPrompt,
} from "../src/lib/chat/prompt.ts";

test("includes the packet text inside the guide tags", () => {
  const prompt = buildSystemPrompt("Doors lock at 8:00 PM.");
  assert.ok(prompt.includes("<guide>\nDoors lock at 8:00 PM.\n</guide>"));
});

test("tells the model to use the help email and security number", () => {
  const prompt = buildSystemPrompt("packet");
  assert.ok(prompt.includes(HELP_EMAIL));
  assert.ok(prompt.includes(SECURITY_PHONE));
  assert.ok(prompt.includes("ONLY the participant guide"));
});

test("works with an empty packet", () => {
  const prompt = buildSystemPrompt("");
  assert.ok(prompt.includes("<guide>\n\n</guide>"));
});
