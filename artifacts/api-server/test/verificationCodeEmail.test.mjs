import assert from "node:assert/strict";
import test from "node:test";
import {
  buildVerificationCodeEmail,
  sendVerificationCodeEmail,
} from "../src/lib/verificationCodeEmail.ts";

const details = {
  name: "Ada Lovelace",
  email: "ada@wayne.edu",
  code: "ABCD-2345",
  expiresAt: new Date("2026-11-13T15:00:00Z"),
};

test("the email carries the code, the expiry and the registered address", () => {
  const { subject, text, html } = buildVerificationCodeEmail(details);
  assert.match(subject, /verification code/i);
  for (const body of [text, html]) {
    assert.ok(body.includes("ABCD-2345"));
    assert.ok(body.includes("ada@wayne.edu"));
    assert.ok(body.includes("expires"));
  }
});

test("a name can't inject HTML into the email", () => {
  const { html } = buildVerificationCodeEmail({
    ...details,
    name: "<script>alert(1)</script>",
  });
  assert.ok(!html.includes("<script>"));
});

test("sending needs RESEND_API_KEY, posts to Resend and surfaces failures", async (t) => {
  const originalKey = process.env.RESEND_API_KEY;
  t.after(() => {
    if (originalKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalKey;
  });

  delete process.env.RESEND_API_KEY;
  await assert.rejects(sendVerificationCodeEmail(details), /RESEND_API_KEY/);

  process.env.RESEND_API_KEY = "local-test-key";
  const provider = t.mock.method(globalThis, "fetch", async (_url, request) => {
    const sent = JSON.parse(request.body);
    assert.deepEqual(sent.to, ["ada@wayne.edu"]);
    assert.ok(sent.text.includes("ABCD-2345"));
    return new Response(null, { status: 200 });
  });
  await sendVerificationCodeEmail(details);
  assert.equal(provider.mock.callCount(), 1);

  provider.mock.mockImplementationOnce(
    async () => new Response("ada@wayne.edu ABCD-2345", { status: 503 }),
  );
  await assert.rejects(sendVerificationCodeEmail(details), (err) => {
    assert.match(err.message, /503/);
    // The error text is logged, so it must not echo the code or address.
    assert.ok(!err.message.includes("ABCD-2345"));
    assert.ok(!err.message.includes("ada@wayne.edu"));
    return true;
  });
});
