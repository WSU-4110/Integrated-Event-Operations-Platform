// Security and data-protection checks for the API (NFR-01, NFR-02).
// Runs the built server (dist/index.mjs) against a real PostgreSQL database:
//
//   TEST_DATABASE_URL=postgresql://... pnpm --filter @workspace/api-server test
//
// The database can be shared with nothing else that matters: the server
// applies migrations to it, and the tests add rows with unique emails.

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import pg from "pg";

const DATABASE_URL = process.env.TEST_DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("Set TEST_DATABASE_URL to a PostgreSQL database for tests.");
}

const serverFile = fileURLToPath(new URL("../dist/index.mjs", import.meta.url));
const run = Date.now().toString(36);
const ADMIN_EMAIL = `admin-${run}@example.com`;
const PARTICIPANT_EMAIL = `participant-${run}@wayne.edu`;
const SESSIONS = {
  admin: `test-admin-${run}`,
  user: `test-user-${run}`,
};

const servers = [];

async function startServer(port, env) {
  const child = spawn(process.execPath, [serverFile], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(port),
      DATABASE_URL,
      RUN_MIGRATIONS: "true",
      LOG_LEVEL: "error",
      // Never send real email from tests.
      RESEND_API_KEY: "",
      ...env,
    },
    stdio: ["ignore", "ignore", "inherit"],
  });
  servers.push(child);
  const base = `http://127.0.0.1:${port}/api`;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${base}/healthz`)).ok) return base;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Server on port ${port} didn't start`);
}

async function seed() {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  const users = [
    [`admin-${run}`, ADMIN_EMAIL, SESSIONS.admin],
    [`user-${run}`, `someone-${run}@example.com`, SESSIONS.user],
  ];
  for (const [id, email, sid] of users) {
    await client.query("insert into users (id, email) values ($1, $2)", [
      id,
      email,
    ]);
    await client.query(
      "insert into sessions (sid, sess, expire) values ($1, $2, $3)",
      [
        sid,
        JSON.stringify({
          user: { id, name: null, profileImage: null, roles: [] },
        }),
        // UTC, as the app writes it (through Drizzle). The column has no time
        // zone, so a local-time value would read back as already expired.
        new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      ],
    );
  }
  await client.end();
}

const cookie = (sid) => ({ Cookie: `sid=${sid}` });

// Every admin operation; ID 1 is fine because access is checked first.
const ADMIN_REQUESTS = [
  ["GET", "/admin/registrations"],
  ["GET", "/admin/stats"],
  ["GET", "/admin/export"],
  ["GET", "/admin/registrations/1/history"],
  [
    "PATCH",
    "/admin/registrations/1/status",
    { status: "approved", expected_status: "pending" },
  ],
  ["POST", "/admin/registrations/1/resend-confirmation"],
  ["DELETE", "/admin/registrations/1"],
];

async function call(base, method, path, body, headers = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, text, headers: res.headers };
}

function assertNoParticipantData(text) {
  assert.ok(
    !text.includes(PARTICIPANT_EMAIL),
    "response leaked a participant email",
  );
  assert.deepEqual(Object.keys(JSON.parse(text)), ["error"]);
}

let base;
let unconfiguredBase;

before(async () => {
  base = await startServer(18_400 + Math.floor(Math.random() * 500), {
    ADMIN_EMAILS: ADMIN_EMAIL,
  });
  await seed();
  const res = await call(base, "POST", "/registrations", {
    name: "Test Participant",
    email: PARTICIPANT_EMAIL,
    school: "Wayne State",
    class_standing: "junior",
    experience_level: "beginner",
    discord_username: "testparticipant",
    team_status: "solo",
  });
  assert.equal(res.status, 201);
  // Same database, but no admins configured.
  unconfiguredBase = await startServer(
    18_900 + Math.floor(Math.random() * 500),
    {
      ADMIN_EMAILS: "",
      RUN_MIGRATIONS: "false",
    },
  );
});

after(() => {
  for (const child of servers) child.kill();
});

describe("admin API refuses unauthorized requests", () => {
  for (const [method, path, body] of ADMIN_REQUESTS) {
    test(`${method} ${path} without a session → 401, no data`, async () => {
      const res = await call(base, method, path, body);
      assert.equal(res.status, 401);
      assertNoParticipantData(res.text);
    });

    test(`${method} ${path} as a non-admin → 403, no data`, async () => {
      const res = await call(base, method, path, body, cookie(SESSIONS.user));
      assert.equal(res.status, 403);
      assertNoParticipantData(res.text);
    });
  }

  test("an unknown session cookie is treated as signed out", async () => {
    const res = await call(
      base,
      "GET",
      "/admin/registrations",
      null,
      cookie("not-a-session"),
    );
    assert.equal(res.status, 401);
    assertNoParticipantData(res.text);
  });

  test("with no ADMIN_EMAILS configured, nobody is an admin", async () => {
    const res = await call(
      unconfiguredBase,
      "GET",
      "/admin/registrations",
      null,
      cookie(SESSIONS.admin),
    );
    assert.equal(res.status, 403);
    assertNoParticipantData(res.text);
  });

  test("an admin can read registrations", async () => {
    const res = await call(
      base,
      "GET",
      `/admin/registrations?search=${encodeURIComponent(PARTICIPANT_EMAIL)}`,
      null,
      cookie(SESSIONS.admin),
    );
    assert.equal(res.status, 200);
    assert.ok(res.text.includes(PARTICIPANT_EMAIL));
  });
});

describe("public endpoints don't expose participant data", () => {
  test("the registration check only says yes or no", async () => {
    const res = await call(
      base,
      "GET",
      `/registrations/check?email=${PARTICIPANT_EMAIL}`,
    );
    assert.equal(res.status, 200);
    assert.deepEqual(JSON.parse(res.text), { registered: true });
  });

  test("the signed-out user endpoint returns no user", async () => {
    const res = await call(base, "GET", "/auth/user");
    assert.deepEqual(JSON.parse(res.text), { user: null });
  });
});

describe("registration input and duplicates", () => {
  const valid = {
    name: "Another Person",
    school: "Wayne State",
    class_standing: "senior",
    experience_level: "advanced",
    discord_username: "another",
    team_status: "looking",
  };

  test("a non-.edu email is rejected", async () => {
    const res = await call(base, "POST", "/registrations", {
      ...valid,
      email: `x-${run}@gmail.com`,
    });
    assert.equal(res.status, 400);
  });

  test("the same email can't register twice, in any letter case", async () => {
    const res = await call(base, "POST", "/registrations", {
      ...valid,
      email: PARTICIPANT_EMAIL.toUpperCase(),
    });
    assert.equal(res.status, 409);
  });
});

describe("browser protections", () => {
  test("security headers are set", async () => {
    const res = await call(base, "GET", "/healthz");
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    assert.equal(res.headers.get("x-frame-options"), "DENY");
    assert.ok(res.headers.get("strict-transport-security"));
  });

  test("other websites aren't granted cross-origin access", async () => {
    const res = await call(base, "GET", "/auth/user", null, {
      Origin: "https://evil.example",
    });
    assert.equal(res.headers.get("access-control-allow-origin"), null);
    assert.equal(res.headers.get("access-control-allow-credentials"), null);
  });
});

describe("access and Discord verification status", () => {
  const admin = cookie(SESSIONS.admin);
  const findParticipant = async () => {
    const res = await call(
      base,
      "GET",
      `/admin/registrations?search=${encodeURIComponent(PARTICIPANT_EMAIL)}`,
      null,
      admin,
    );
    return JSON.parse(res.text).registrations[0];
  };

  test("without the bot's table, Discord status is unknown", async () => {
    const r = await findParticipant();
    assert.equal(r.discord_status, "unknown");
    const stats = JSON.parse(
      (await call(base, "GET", "/admin/stats", null, admin)).text,
    );
    assert.equal(stats.discord_verified, null);
  });

  test("a bot verification shows as verified and is counted", async () => {
    const r = await findParticipant();
    const client = new pg.Client({ connectionString: DATABASE_URL });
    await client.connect();
    // Same shape as the bot's migration (Discord-Bot branch).
    await client.query("create schema if not exists discord_bot");
    await client.query(`create table if not exists discord_bot.participant_links (
      id serial primary key, discord_user_id text not null unique,
      registration_id integer not null unique,
      linked_at timestamp with time zone not null default now(), linked_by text,
      active boolean not null default true, checked_in boolean not null default false,
      checked_in_at timestamp with time zone,
      updated_at timestamp with time zone not null default now())`);
    await client.query(
      "insert into discord_bot.participant_links (discord_user_id, registration_id) values ($1, $2)",
      [`discord-${run}`, r.id],
    );
    await client.end();

    const after = await findParticipant();
    assert.equal(after.discord_status, "verified");
    assert.ok(after.discord_verified_at);
    const stats = JSON.parse(
      (await call(base, "GET", "/admin/stats", null, admin)).text,
    );
    assert.ok(stats.discord_verified >= 1);
  });

  test("an organizer can remove someone and restore them", async () => {
    const r = await findParticipant();
    assert.deepEqual(r.allowed_statuses, ["declined"]);
    const removed = await call(
      base,
      "PATCH",
      `/admin/registrations/${r.id}/status`,
      { status: "declined", expected_status: r.status },
      admin,
    );
    assert.equal(removed.status, 200);
    assert.deepEqual(JSON.parse(removed.text).allowed_statuses, ["pending"]);

    const removedList = JSON.parse(
      (
        await call(
          base,
          "GET",
          `/admin/registrations?access=removed&search=${encodeURIComponent(PARTICIPANT_EMAIL)}`,
          null,
          admin,
        )
      ).text,
    );
    assert.equal(removedList.total, 1);
    const activeList = JSON.parse(
      (
        await call(
          base,
          "GET",
          `/admin/registrations?access=active&search=${encodeURIComponent(PARTICIPANT_EMAIL)}`,
          null,
          admin,
        )
      ).text,
    );
    assert.equal(activeList.total, 0);

    const approve = await call(
      base,
      "PATCH",
      `/admin/registrations/${r.id}/status`,
      { status: "approved", expected_status: "declined" },
      admin,
    );
    assert.equal(approve.status, 400, "approving is no longer an option");

    const restored = await call(
      base,
      "PATCH",
      `/admin/registrations/${r.id}/status`,
      { status: "pending", expected_status: "declined" },
      admin,
    );
    assert.equal(restored.status, 200);
    assert.equal(JSON.parse(restored.text).status, "pending");
  });
});
