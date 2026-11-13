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
  ["GET", "/admin/event-content"],
  ["POST", "/admin/event-content"],
  ["PUT", "/admin/event-content/1"],
  ["DELETE", "/admin/event-content/1"],
  ["GET", "/admin/registrations/1/history"],
  [
    "PATCH",
    "/admin/registrations/1/status",
    { status: "approved", expected_status: "pending" },
  ],
  [
    "PATCH",
    "/admin/registrations/1",
    {
      name: "Edited",
      email: "edited@wayne.edu",
      school: "Wayne State",
      class_standing: "junior",
      experience_level: "beginner",
      discord_username: "edited",
      team_status: "solo",
      team_name: null,
    },
  ],
  ["POST", "/admin/registrations/1/resend-confirmation"],
  ["POST", "/admin/registrations/1/verification-code"],
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
    const availability = await call(base, "GET", "/status");
    assert.equal(availability.status, 200);
    assert.equal(JSON.parse(availability.text).discordLinkStore, "unavailable");
    const r = await findParticipant();
    assert.equal(r.discord_status, "unknown");
    const stats = JSON.parse(
      (await call(base, "GET", "/admin/stats", null, admin)).text,
    );
    assert.equal(stats.discord_verified, null);
  });

  test("without the bot's table, the Discord filter explains it can't be used", async () => {
    const res = await call(
      base,
      "GET",
      "/admin/registrations?discord=verified",
      null,
      admin,
    );
    assert.equal(res.status, 503);
    assertNoParticipantData(res.text);
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

describe("organizers can edit a registration", () => {
  const admin = cookie(SESSIONS.admin);
  const EDIT_EMAIL = `edit-${run}@wayne.edu`;
  const OTHER_EMAIL = `edit-other-${run}@wayne.edu`;
  const base_ = {
    school: "Wayne State",
    class_standing: "sophomore",
    experience_level: "beginner",
    team_status: "looking",
  };
  let id;
  const details = (overrides = {}) => ({
    name: "Edit Me",
    email: EDIT_EMAIL,
    ...base_,
    discord_username: "edit.me",
    team_name: null,
    ...overrides,
  });

  before(async () => {
    for (const [email, discord] of [
      [EDIT_EMAIL, "Edit Me Display Name"],
      [OTHER_EMAIL, "someoneelse"],
    ]) {
      const res = await call(base, "POST", "/registrations", {
        name: "Edit Me",
        email,
        ...base_,
        discord_username: discord,
      });
      assert.equal(res.status, 201);
      if (email === EDIT_EMAIL) id = JSON.parse(res.text).id;
    }
  });

  test("a wrong Discord username can be fixed, and is normalized", async () => {
    const res = await call(
      base,
      "PATCH",
      `/admin/registrations/${id}`,
      details({ discord_username: "  @Edit.Me  ", name: " Edit Me Fixed " }),
      admin,
    );
    assert.equal(res.status, 200);
    const body = JSON.parse(res.text);
    assert.equal(body.discord_username, "edit.me");
    assert.equal(body.name, "Edit Me Fixed");
    assert.equal(body.status, "pending", "editing doesn't change access");
  });

  test("a display name that can't be a username is refused", async () => {
    const res = await call(
      base,
      "PATCH",
      `/admin/registrations/${id}`,
      details({ discord_username: "Edit Me Display Name" }),
      admin,
    );
    assert.equal(res.status, 400);
  });

  test("the email must stay .edu and unique", async () => {
    const gmail = await call(
      base,
      "PATCH",
      `/admin/registrations/${id}`,
      details({ email: `edit-${run}@gmail.com` }),
      admin,
    );
    assert.equal(gmail.status, 400);
    const taken = await call(
      base,
      "PATCH",
      `/admin/registrations/${id}`,
      details({ email: OTHER_EMAIL.toUpperCase() }),
      admin,
    );
    assert.equal(taken.status, 409);
  });

  test("the team name is kept only for people with a team", async () => {
    const withTeam = await call(
      base,
      "PATCH",
      `/admin/registrations/${id}`,
      details({ team_status: "has_team", team_name: "Night Owls" }),
      admin,
    );
    assert.equal(JSON.parse(withTeam.text).team_name, "Night Owls");
    const solo = await call(
      base,
      "PATCH",
      `/admin/registrations/${id}`,
      details({ team_status: "solo", team_name: "Night Owls" }),
      admin,
    );
    assert.equal(JSON.parse(solo.text).team_name, null);
  });

  test("an unknown registration is a 404", async () => {
    const res = await call(
      base,
      "PATCH",
      "/admin/registrations/999999999",
      details({ email: `nobody-${run}@wayne.edu` }),
      admin,
    );
    assert.equal(res.status, 404);
  });
});

describe("dashboard filters and check-in count", () => {
  const admin = cookie(SESSIONS.admin);
  const list = async (query) =>
    JSON.parse(
      (
        await call(
          base,
          "GET",
          `/admin/registrations?search=${encodeURIComponent(PARTICIPANT_EMAIL)}&${query}`,
          null,
          admin,
        )
      ).text,
    );

  test("filters by class standing", async () => {
    assert.equal((await list("class_standing=junior")).total, 1);
    assert.equal((await list("class_standing=senior")).total, 0);
  });

  test("filters by Discord verification", async () => {
    // The participant was linked by the Discord verification test above.
    assert.equal((await list("discord=verified")).total, 1);
    assert.equal((await list("discord=not_verified")).total, 0);
  });

  test("filters by check-in and counts check-ins", async () => {
    const before = await list("check_in=not_checked_in");
    assert.equal(before.total, 1);
    assert.equal(before.registrations[0].checked_in_at, null);
    const statsBefore = JSON.parse(
      (await call(base, "GET", "/admin/stats", null, admin)).text,
    );

    const client = new pg.Client({ connectionString: DATABASE_URL });
    await client.connect();
    await client.query(
      "update registrations set checked_in_at = now(), checked_in_by = $1 where email = $2",
      [`admin-${run}`, PARTICIPANT_EMAIL],
    );
    await client.end();

    const after = await list("check_in=checked_in");
    assert.equal(after.total, 1);
    assert.ok(after.registrations[0].checked_in_at);
    assert.equal((await list("check_in=not_checked_in")).total, 0);
    const statsAfter = JSON.parse(
      (await call(base, "GET", "/admin/stats", null, admin)).text,
    );
    assert.equal(statsAfter.checked_in, statsBefore.checked_in + 1);
  });

  test("rejects unknown filter values", async () => {
    const res = await call(
      base,
      "GET",
      "/admin/registrations?check_in=maybe",
      null,
      admin,
    );
    assert.equal(res.status, 400);
  });
});

describe("FR-13 event content", () => {
  const organizerPath = "/admin/event-content";
  const publicPath = "/event-content";
  const admin = cookie(SESSIONS.admin);
  const announcement = {
    kind: "announcement",
    title: `Welcome ${run}`,
    body: "Check in at noon.",
    published: false,
  };

  async function list(path, headers = {}) {
    const result = await call(base, "GET", path, undefined, headers);
    assert.equal(result.status, 200);
    return JSON.parse(result.text);
  }

  async function create(content) {
    const result = await call(base, "POST", organizerPath, content, admin);
    assert.equal(result.status, 201);
    return JSON.parse(result.text);
  }

  test("an organizer can draft, publish, edit, unpublish, and delete an announcement", async () => {
    const draft = await create(announcement);
    const path = `${organizerPath}/${draft.id}`;
    const publicItem = async () =>
      (await list(publicPath)).find(({ id }) => id === draft.id);
    assert.equal(draft.authorId, `admin-${run}`);
    assert.ok(Number.isFinite(Date.parse(draft.updatedAt)));
    assert.ok(
      (await list(organizerPath, admin)).some(({ id }) => id === draft.id),
    );
    assert.equal(await publicItem(), undefined);

    const published = await call(
      base,
      "PUT",
      path,
      {
        ...announcement,
        body: "Check in at 1 PM.",
        published: true,
      },
      admin,
    );
    assert.equal(published.status, 200);
    const saved = JSON.parse(published.text);
    assert.equal(saved.authorId, draft.authorId);
    assert.ok(Date.parse(saved.updatedAt) >= Date.parse(draft.updatedAt));
    const visible = await publicItem();
    assert.equal(visible.body, "Check in at 1 PM.");
    assert.ok(!Object.hasOwn(visible, "authorId"));

    const unpublished = await call(base, "PUT", path, announcement, admin);
    assert.equal(unpublished.status, 200);
    assert.equal(await publicItem(), undefined);
    assert.equal(
      (await call(base, "DELETE", path, undefined, admin)).status,
      204,
    );
    assert.ok(
      !(await list(organizerPath, admin)).some(({ id }) => id === draft.id),
    );
  });

  test("ordered links survive invalid updates and database write failures", async () => {
    const resource = {
      kind: "resource",
      title: `Submit ${run}`,
      url: "https://example.com/submit",
      position: 20,
      published: true,
    };
    const second = await create(resource);
    const first = await create({
      ...resource,
      title: `Rules ${run}`,
      position: 10,
    });
    const path = `${organizerPath}/${second.id}`;
    const publicLinks = async () =>
      (await list(publicPath)).filter(
        ({ id }) => id === first.id || id === second.id,
      );
    assert.deepEqual(
      (await publicLinks()).map(({ id }) => id),
      [first.id, second.id],
    );

    const invalid = await call(
      base,
      "PUT",
      path,
      { ...resource, url: "invalid link" },
      admin,
    );
    assert.equal(invalid.status, 400);
    assert.equal((await publicLinks())[1].url, resource.url);

    // Make PostgreSQL reject an otherwise valid update in this disposable test database.
    const client = new pg.Client({ connectionString: DATABASE_URL });
    await client.connect();
    try {
      await client.query(
        "ALTER TABLE event_content ADD CONSTRAINT fr13_test_reject_title CHECK (title <> 'FR-13 test rejected save') NOT VALID",
      );
      const failed = await call(
        base,
        "PUT",
        path,
        {
          ...resource,
          title: "FR-13 test rejected save",
          published: false,
        },
        admin,
      );
      assert.equal(failed.status, 500);
      assert.deepEqual(JSON.parse(failed.text), {
        error: "Could not save or load event content.",
      });
      assert.equal((await publicLinks())[1].title, resource.title);

      const reordered = await call(
        base,
        "PUT",
        path,
        { ...resource, position: 5 },
        admin,
      );
      assert.equal(reordered.status, 200);
      assert.deepEqual(
        (await publicLinks()).map(({ id }) => id),
        [second.id, first.id],
      );
    } finally {
      await client.query(
        "ALTER TABLE event_content DROP CONSTRAINT IF EXISTS fr13_test_reject_title",
      );
      await client.end();
      for (const { id } of [first, second]) {
        await call(base, "DELETE", `${organizerPath}/${id}`, undefined, admin);
      }
    }
  });
});

describe("NFR-05 availability status", () => {
  test("reports database and integrations without making Discord a liveness dependency", async () => {
    const status = await call(base, "GET", "/status");
    assert.equal(status.status, 200);
    assert.equal(status.headers.get("cache-control"), "no-store");
    const body = JSON.parse(status.text);
    assert.equal(body.web, "up");
    assert.equal(body.database, "up");
    assert.equal(body.discordLinkStore, "up");
    assert.deepEqual(body.confirmationEmail, { status: "disabled" });
    assert.equal((await call(base, "GET", "/healthz")).status, 200);
  });

  test("reports database failure while liveness still responds", async () => {
    const withoutDb = await startServer(19_400 + Math.floor(Math.random() * 500), {
      DATABASE_URL: "postgresql://unused@127.0.0.1:1/unused",
      RUN_MIGRATIONS: "false",
    });
    const status = await call(withoutDb, "GET", "/status");
    assert.equal(status.status, 503);
    const body = JSON.parse(status.text);
    assert.equal(body.web, "up");
    assert.equal(body.database, "unavailable");
    assert.equal(body.discordLinkStore, "unknown");
    assert.equal((await call(withoutDb, "GET", "/healthz")).status, 200);
  });
});

describe("FR-05 verification codes", () => {
  const admin = cookie(SESSIONS.admin);
  const CODE_EMAIL = `code-${run}@wayne.edu`;
  let id;

  const dbRows = async (sql, params = []) => {
    const client = new pg.Client({ connectionString: DATABASE_URL });
    await client.connect();
    try {
      return (await client.query(sql, params)).rows;
    } finally {
      await client.end();
    }
  };
  const codes = () =>
    dbRows(
      "select * from verification_codes where registration_id = $1 order by id",
      [id],
    );
  const issue = () =>
    call(base, "POST", `/admin/registrations/${id}/verification-code`, null, admin);

  before(async () => {
    const res = await call(base, "POST", "/registrations", {
      name: "Code Person",
      email: CODE_EMAIL,
      school: "Wayne State",
      class_standing: "junior",
      experience_level: "beginner",
      discord_username: "codeperson",
      team_status: "solo",
    });
    assert.equal(res.status, 201);
    id = JSON.parse(res.text).id;
  });

  test("a code is stored hashed, expires within 24 hours, and is never returned", async () => {
    const res = await issue();
    assert.equal(res.status, 200);
    // Tests run without RESEND_API_KEY, so the email fails: still recorded.
    assert.deepEqual(JSON.parse(res.text), { email_sent: false });
    const [row] = await codes();
    assert.match(row.code_hash, /^[0-9a-f]{64}$/);
    assert.ok(row.email_failed_at, "the failed email is recorded");
    assert.equal(row.email_sent_at, null);
    const ms = row.expires_at.getTime() - Date.now();
    assert.ok(ms > 0 && ms <= 24 * 60 * 60 * 1000);
  });

  test("a replacement invalidates the earlier unused code", async () => {
    assert.equal((await issue()).status, 200);
    const rows = await codes();
    assert.equal(rows.length, 2);
    assert.ok(rows[0].invalidated_at, "the first code was invalidated");
    assert.equal(rows[1].invalidated_at, null);
    const unused = rows.filter((r) => !r.used_at && !r.invalidated_at);
    assert.equal(unused.length, 1, "only one unused code at a time");
  });

  test("the database refuses a second unused code", async () => {
    await assert.rejects(
      dbRows(
        "insert into verification_codes (registration_id, code_hash, expires_at) values ($1, 'x', now())",
        [id],
      ),
      /verification_codes_one_unused_idx/,
    );
  });

  test("the dashboard shows the code status, not the code", async () => {
    const res = await call(
      base,
      "GET",
      `/admin/registrations?search=${encodeURIComponent(CODE_EMAIL)}`,
      null,
      admin,
    );
    const registration = JSON.parse(res.text).registrations[0];
    assert.equal(registration.verification_code_status, "email_failed");
    assert.ok(!res.text.includes("code_hash"));
  });

  test("removing someone invalidates their code and blocks new ones", async () => {
    const removed = await call(
      base,
      "PATCH",
      `/admin/registrations/${id}/status`,
      { status: "declined", expected_status: "pending" },
      admin,
    );
    assert.equal(removed.status, 200);
    const unused = (await codes()).filter(
      (r) => !r.used_at && !r.invalidated_at,
    );
    assert.equal(unused.length, 0);
    const refused = await issue();
    assert.equal(refused.status, 409);
    assert.equal((await codes()).length, 2, "no code was created");
  });

  test("an unknown registration gets a 404", async () => {
    const res = await call(
      base,
      "POST",
      "/admin/registrations/999999999/verification-code",
      null,
      admin,
    );
    assert.equal(res.status, 404);
  });
});
