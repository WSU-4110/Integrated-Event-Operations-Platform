import assert from "node:assert/strict";
import test from "node:test";
import { prepareEventContent } from "../src/lib/eventContent.ts";

test("prepares a draft announcement and trims its text", () => {
  assert.deepEqual(
    prepareEventContent({ kind: "announcement", title: "  Welcome  ", body: "  Check in at noon. " }),
    { kind: "announcement", title: "Welcome", body: "Check in at noon.", url: null, position: 0, published: false },
  );
});

test("prepares a published resource with a valid URL and order", () => {
  assert.deepEqual(
    prepareEventContent({ kind: "resource", title: "Submit", url: "https://example.com/submit", position: 2, published: true }),
    { kind: "resource", title: "Submit", body: null, url: "https://example.com/submit", position: 2, published: true },
  );
});

test("rejects unsupported content, empty announcements, and unsafe links", () => {
  for (const item of [
    { kind: "other", title: "Welcome" },
    { kind: "announcement", title: "Welcome", body: " " },
    { kind: "resource", title: "Submit", url: "javascript:alert(1)", position: 0 },
    { kind: "resource", title: "Submit", url: "https://user:pass@example.com/", position: 0 },
    { kind: "resource", title: "Submit", url: "https://example.com/", position: -1 },
    { kind: "announcement", title: "Welcome", body: "Hello", published: "false" },
  ]) assert.equal(prepareEventContent(item), null);
});
