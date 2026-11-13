import { before, after, describe, test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";

export function checkInTests({
  getBase,
  call,
  databaseUrl,
  admin,
  organizerId,
}) {
  describe("FR-10 organizer check-in", () => {
    let client,
      sequence = 0;
    const run = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    before(async () => {
      client = new pg.Client({ connectionString: databaseUrl });
      await client.connect();
    });
    after(async () => {
      if (client) {
        await client.query("delete from registrations where email like $1", [
          `checkin-${run}-%`,
        ]);
        await client.end();
      }
    });
    const participant = async (
      status = "approved",
      event = "builderwars-2026",
    ) => {
      const email = `checkin-${run}-${sequence++}@example.edu`;
      return (
        await client.query(
          "insert into registrations (event_id,name,email,school,class_standing,experience_level,discord_username,status) values ($1,'Check In Participant',$2,'Test University','junior','beginner','check.in',$3) returning *",
          [event, email, status],
        )
      ).rows[0];
    };
    const check = (id, body) =>
      call(
        getBase(),
        "POST",
        `/admin/registrations/${id}/check-in`,
        body,
        admin,
      );
    const saved = async (id) =>
      (await client.query("select * from registrations where id=$1", [id]))
        .rows[0];
    const stats = async () =>
      JSON.parse(
        (await call(getBase(), "GET", "/admin/stats", null, admin)).text,
      );
    test("records event, participant, server time and authenticated organizer, ignoring forged client metadata", async () => {
      const p = await participant();
      const before = Date.now();
      const result = await check(p.id, {
        checked_in_at: "2000-01-01",
        checked_in_by: "forged",
        status: "pending",
      });
      assert.equal(result.status, 200);
      const body = JSON.parse(result.text),
        row = await saved(p.id);
      assert.equal(body.registration_id, p.id);
      assert.equal(body.event_id, "builderwars-2026");
      assert.equal(body.checked_in_by, organizerId);
      assert.equal(row.checked_in_by, organizerId);
      assert.equal(body.checked_in_at, row.checked_in_at.toISOString());
      assert.ok(
        row.checked_in_at.getTime() >= before - 1000 &&
          row.checked_in_at.getTime() <= Date.now() + 1000,
      );
    });
    test("updates dashboard count, attendance filters and participant attendance state after saving", async () => {
      const p = await participant();
      const before = await stats();
      assert.equal((await check(p.id)).status, 200);
      assert.equal((await stats()).checked_in, before.checked_in + 1);
      for (const [filter, total] of [
        ["checked_in", 1],
        ["not_checked_in", 0],
      ]) {
        const r = await call(
          getBase(),
          "GET",
          `/admin/registrations?search=${encodeURIComponent(p.email)}&check_in=${filter}`,
          null,
          admin,
        );
        assert.equal(r.status, 200);
        const list = JSON.parse(r.text);
        assert.equal(list.total, total);
        if (total) assert.ok(list.registrations[0].checked_in_at);
      }
    });
    test("refuses pending, waitlisted and declined without recording attendance", async () => {
      for (const status of ["pending", "waitlisted", "declined"]) {
        const p = await participant(status);
        assert.equal((await check(p.id)).status, 409);
        const row = await saved(p.id);
        assert.equal(row.checked_in_at, null);
        assert.equal(row.checked_in_by, null);
      }
    });
    test("rejects invalid IDs and does not expose or change another event's participant", async () => {
      for (const id of [
        "0",
        "-1",
        "1.5",
        "nope",
        "2147483648",
        "9007199254740992",
      ])
        assert.equal((await check(id)).status, 400);
      assert.equal((await check(2147483647)).status, 404);
      const p = await participant("approved", "other-event");
      assert.equal((await check(p.id)).status, 404);
      assert.equal((await saved(p.id)).checked_in_at, null);
    });
    test("duplicate requests preserve the first check-in time and organizer", async () => {
      const p = await participant();
      assert.equal((await check(p.id)).status, 200);
      const first = await saved(p.id);
      assert.equal(
        (await check(p.id, { checked_in_by: "overwrite" })).status,
        409,
      );
      const second = await saved(p.id);
      assert.equal(
        second.checked_in_at.toISOString(),
        first.checked_in_at.toISOString(),
      );
      assert.equal(second.checked_in_by, first.checked_in_by);
    });
    test("simultaneous requests create exactly one check-in and count it once", async () => {
      const p = await participant(),
        before = await stats();
      const results = await Promise.all([check(p.id), check(p.id)]);
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
      assert.equal((await stats()).checked_in, before.checked_in + 1);
    });
    test("failed writes return an error and leave both attendance fields and count unchanged", async () => {
      const p = await participant(),
        before = await stats();
      await client.query(
        `alter table registrations add constraint fr10_test_save_failure check (id <> ${p.id} or checked_in_at is null)`,
      );
      try {
        const result = await check(p.id);
        assert.equal(result.status, 500);
        assert.ok(JSON.parse(result.text).error);
        const row = await saved(p.id);
        assert.equal(row.checked_in_at, null);
        assert.equal(row.checked_in_by, null);
        assert.equal((await stats()).checked_in, before.checked_in);
      } finally {
        await client.query(
          "alter table registrations drop constraint fr10_test_save_failure",
        );
      }
    });
    test("a participant removed since the list loaded cannot be checked in", async () => {
      const p = await participant();
      await client.query(
        "update registrations set status='declined' where id=$1",
        [p.id],
      );
      assert.equal((await check(p.id)).status, 409);
      assert.equal((await saved(p.id)).checked_in_at, null);
    });
    test("a removal racing with check-in cannot produce a false successful check-in", async () => {
      const p = await participant();
      const [attendance, removal] = await Promise.all([
        check(p.id),
        call(
          getBase(),
          "PATCH",
          `/admin/registrations/${p.id}/status`,
          { status: "declined", expected_status: "approved" },
          admin,
        ),
      ]);
      assert.equal(removal.status, 200);
      assert.ok([200, 409].includes(attendance.status));
      const row = await saved(p.id);
      assert.equal(row.status, "declined");
      assert.equal(Boolean(row.checked_in_at), attendance.status === 200);
    });
  });
}
