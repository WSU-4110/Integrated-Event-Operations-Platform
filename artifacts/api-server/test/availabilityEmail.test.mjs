import assert from "node:assert/strict";
import test from "node:test";
import {
  getConfirmationEmailStatus,
  sendRegistrationConfirmation,
} from "../src/lib/registrationConfirmationEmail.ts";

test("reports recent email outcomes with a request timeout and expires old signals", async (t) => {
  const originalKey = process.env.RESEND_API_KEY;
  t.after(() => {
    if (originalKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalKey;
  });
  process.env.RESEND_API_KEY = "local-test-key";
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-01T12:00:00Z") });

  const details = { name: "Test", email: "test@example.com", discordUsername: null };
  const provider = t.mock.method(globalThis, "fetch", async (_url, request) => {
    assert.ok(request.signal instanceof AbortSignal);
    return new Response(null, { status: 200 });
  });

  assert.deepEqual(getConfirmationEmailStatus(), { status: "unknown" });
  await sendRegistrationConfirmation(details);
  assert.equal(getConfirmationEmailStatus().status, "accepted");

  provider.mock.mockImplementationOnce(async () => new Response("Unavailable", { status: 503 }));
  await assert.rejects(sendRegistrationConfirmation(details), /503/);
  assert.equal(getConfirmationEmailStatus().status, "failed");

  t.mock.timers.tick(16 * 60 * 1000);
  assert.deepEqual(getConfirmationEmailStatus(), { status: "unknown" });
});
