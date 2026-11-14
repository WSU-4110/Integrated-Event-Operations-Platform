import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_ASSISTANT_CHARS,
  MAX_HISTORY,
  MAX_MESSAGE_CHARS,
  validateMessages,
} from "../src/lib/chat/validation.ts";

const user = (content) => ({ role: "user", content });
const bot = (content) => ({ role: "assistant", content });
const manyUserMessages = (count) =>
  Array.from({ length: count }, (_, i) => user(`q${i}`));

test("rejects input that is not a non-empty array", () => {
  for (const value of [undefined, null, "hello", 42, {}, []]) {
    assert.equal(validateMessages(value).ok, false);
  }
});

test("content length boundaries: 0, 1, max, and max + 1 characters", () => {
  assert.equal(validateMessages([user("")]).ok, false);
  assert.equal(validateMessages([user("   ")]).ok, false);
  assert.equal(validateMessages([user("a")]).ok, true);
  assert.equal(validateMessages([user("a".repeat(MAX_MESSAGE_CHARS))]).ok, true);
  assert.equal(validateMessages([user("a".repeat(MAX_MESSAGE_CHARS + 1))]).ok, false);
});

test("assistant replies may be longer than user messages (boundaries: max and max + 1)", () => {
  const longReply = (length) => bot("a".repeat(length));
  // A reply well over the 500-character user limit must not break the next question.
  assert.equal(
    validateMessages([user("hi"), longReply(MAX_MESSAGE_CHARS + 1), user("more?")]).ok,
    true,
  );
  assert.equal(
    validateMessages([user("hi"), longReply(MAX_ASSISTANT_CHARS), user("more?")]).ok,
    true,
  );
  assert.equal(
    validateMessages([user("hi"), longReply(MAX_ASSISTANT_CHARS + 1), user("more?")]).ok,
    false,
  );
});

test("history size boundaries: 1, max, and max + 1 messages", () => {
  assert.equal(validateMessages(manyUserMessages(1)).ok, true);
  assert.equal(validateMessages(manyUserMessages(MAX_HISTORY)).ok, true);
  assert.equal(validateMessages(manyUserMessages(MAX_HISTORY + 1)).ok, false);
});

test("rejects invalid roles, missing roles, and non-string content", () => {
  assert.equal(validateMessages([{ role: "system", content: "hi" }]).ok, false);
  assert.equal(validateMessages([{ content: "hi" }]).ok, false);
  assert.equal(validateMessages([{ role: "user", content: 123 }]).ok, false);
});

test("rejects entries that are not objects", () => {
  assert.equal(validateMessages(["hi"]).ok, false);
  assert.equal(validateMessages([null]).ok, false);
});

test("requires the conversation to start and end with a user message", () => {
  assert.equal(validateMessages([user("hi"), bot("hello")]).ok, false);
  assert.equal(validateMessages([bot("hello"), user("hi")]).ok, false);
  assert.equal(
    validateMessages([user("hi"), bot("hello"), user("parking?")]).ok,
    true,
  );
});

test("returns the messages on success and an error string on failure", () => {
  const input = [user("hi")];
  assert.deepEqual(validateMessages(input), { ok: true, messages: input });

  const failure = validateMessages([]);
  assert.equal(failure.ok, false);
  assert.ok(failure.error.length > 0);
});
