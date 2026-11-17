import assert from "node:assert/strict";
import test from "node:test";
import {
  AnthropicProvider,
  DEFAULT_MODEL,
} from "../src/lib/chat/anthropicProvider.ts";

const request = {
  system: "Be helpful.",
  messages: [{ role: "user", content: "When do doors lock?" }],
};

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

test("requires an API key", () => {
  assert.throws(() => new AnthropicProvider({ apiKey: "" }));
});

test("sends the request in Anthropic's format and returns the reply text", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async (url, init) => {
    assert.equal(url, "https://api.anthropic.com/v1/messages");
    assert.equal(init.method, "POST");
    assert.equal(init.headers["x-api-key"], "test-key");
    assert.ok(init.headers["anthropic-version"]);
    assert.ok(init.signal instanceof AbortSignal);

    const body = JSON.parse(init.body);
    assert.equal(body.model, DEFAULT_MODEL);
    assert.deepEqual(body.messages, request.messages);
    assert.equal(body.system[0].text, "Be helpful.");
    assert.deepEqual(body.system[0].cache_control, { type: "ephemeral" });

    return jsonResponse({ content: [{ type: "text", text: "8:00 PM." }] });
  });

  const provider = new AnthropicProvider({ apiKey: "test-key" });
  assert.equal(await provider.complete(request), "8:00 PM.");
  assert.equal(fetchMock.mock.callCount(), 1);
});

test("joins several text blocks and ignores other block types", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    jsonResponse({
      content: [
        { type: "text", text: "Hello " },
        { type: "tool_use" },
        { type: "text", text: "there" },
      ],
    }),
  );
  const provider = new AnthropicProvider({ apiKey: "test-key" });
  assert.equal(await provider.complete(request), "Hello there");
});

test("throws when the API returns an error status, without leaking the key", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    jsonResponse({ error: { message: "bad key test-key" } }, 401),
  );
  const provider = new AnthropicProvider({ apiKey: "test-key" });
  await assert.rejects(provider.complete(request), (error) => {
    assert.match(error.message, /401/);
    assert.ok(!error.message.includes("test-key"));
    return true;
  });
});

test("throws when the reply has no text", async (t) => {
  t.mock.method(globalThis, "fetch", async () => jsonResponse({ content: [] }));
  const provider = new AnthropicProvider({ apiKey: "test-key" });
  await assert.rejects(provider.complete(request), /no text/);
});

test("passes network failures up to the caller", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw new TypeError("network down");
  });
  const provider = new AnthropicProvider({ apiKey: "test-key" });
  await assert.rejects(provider.complete(request), /network down/);
});
