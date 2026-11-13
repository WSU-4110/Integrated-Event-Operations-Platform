import { before, after, describe, test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";

export function attendanceCorrectionTests({
  getBase,
  call,
  databaseUrl,
  admin,
  organizerId,
}) {
  describe("FR-11 attendance corrections", () => {
    let client,
      n = 0;
    const run = Date.now().toString(36);
    before(async () => {
      client = new pg.Client({ connectionString: databaseUrl });
      await client.connect();
    });
    after(async () => {
      if (client) {
        await client.query("delete from registrations where email like $1", [
          `correction-${run}-%`,
        ]);
        await client.end();
      }
    });
    const person = async () =>
      (
        await client.query(
          "insert into registrations(name,email,school,class_standing,experience_level,status) values('Correction Participant',$1,'Test University','junior','beginner','approved') returning id",
          [`correction-${run}-${n++}@example.edu`],
        )
      ).rows[0].id;
    const check = (id) =>
      call(
        getBase(),
        "POST",
        `/admin/registrations/${id}/check-in`,
        null,
        admin,
      );
    const current = async (id) =>
      (await client.query("select * from registrations where id=$1", [id]))
        .rows[0];
    const undo = (id, version, reason = "Accidental selection") =>
      call(
        getBase(),
        "POST",
        `/admin/registrations/${id}/undo-check-in`,
        { reason, expected_attendance_version: version },
        admin,
      );
    const history = async (id) => {
      const r = await call(
        getBase(),
        "GET",
        `/admin/registrations/${id}/attendance-corrections`,
        null,
        admin,
      );
      assert.equal(r.status, 200);
      return JSON.parse(r.text).corrections;
    };
    test("reverses atomically, records reason/organizer/time/original attendance, and permits correct check-in again", async () => {
      const id = await person();
      assert.equal((await check(id)).status, 200);
      const original = await current(id);
      const r = await undo(
        id,
        original.attendance_version,
        "  Wrong participant selected  ",
      );
      assert.equal(r.status, 200);
      let row = await current(id);
      assert.equal(row.checked_in_at, null);
      assert.equal(row.checked_in_by, null);
      assert.equal(row.attendance_version, original.attendance_version + 1);
      const entries = await history(id);
      assert.equal(entries.length, 1);
      assert.equal(entries[0].reason, "Wrong participant selected");
      assert.equal(entries[0].corrected_by, organizerId);
      assert.ok(entries[0].corrected_at);
      assert.equal(
        entries[0].original_checked_in_at,
        original.checked_in_at.toISOString(),
      );
      assert.equal(entries[0].original_checked_in_by, organizerId);
      assert.equal((await check(id)).status, 200);
      row = await current(id);
      assert.ok(row.checked_in_at);
      assert.equal(row.attendance_version, original.attendance_version + 2);
    });
    test("rejects empty/blank/oversized reasons and invalid or missing versions without changing attendance", async () => {
      const id = await person();
      await check(id);
      const row = await current(id);
      for (const reason of ["", " \n\t ", "x".repeat(1001)])
        assert.equal(
          (await undo(id, row.attendance_version, reason)).status,
          400,
        );
      for (const version of [-1, 1.5, null, undefined, "1"])
        assert.equal((await undo(id, version)).status, 400);
      assert.equal(
        (await current(id)).checked_in_at.toISOString(),
        row.checked_in_at.toISOString(),
      );
      assert.equal((await history(id)).length, 0);
    });
    test("duplicate check-in returns the original time without adding attendance or history", async () => {
      const id = await person();
      await check(id);
      const row = await current(id);
      const duplicate = await check(id);
      assert.equal(duplicate.status, 409);
      assert.match(
        JSON.parse(duplicate.text).error,
        new RegExp(row.checked_in_at.toISOString().replaceAll(".", "\\.")),
      );
      assert.equal(
        (await current(id)).attendance_version,
        row.attendance_version,
      );
      assert.equal((await history(id)).length, 0);
    });
    test("duplicate corrections and stale forms cannot reverse a newer check-in", async () => {
      const id = await person();
      await check(id);
      const original = await current(id);
      const results = await Promise.all([
        undo(id, original.attendance_version),
        undo(id, original.attendance_version),
      ]);
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
      assert.equal((await history(id)).length, 1);
      await check(id);
      const newer = await current(id);
      assert.equal((await undo(id, original.attendance_version)).status, 409);
      assert.equal(
        (await current(id)).checked_in_at.toISOString(),
        newer.checked_in_at.toISOString(),
      );
    });
    test("audit write failure rolls back attendance clearing and version increment", async () => {
      const id = await person();
      await check(id);
      const row = await current(id);
      await client.query(
        `alter table attendance_corrections add constraint correction_test_failure check(registration_id <> ${id})`,
      );
      try {
        assert.equal((await undo(id, row.attendance_version)).status, 500);
        const unchanged = await current(id);
        assert.equal(
          unchanged.checked_in_at.toISOString(),
          row.checked_in_at.toISOString(),
        );
        assert.equal(unchanged.checked_in_by, row.checked_in_by);
        assert.equal(unchanged.attendance_version, row.attendance_version);
        assert.equal((await history(id)).length, 0);
      } finally {
        await client.query(
          "alter table attendance_corrections drop constraint correction_test_failure",
        );
      }
    });
    test("missing, other-event and not-checked-in records cannot be corrected", async () => {
      const id = await person();
      assert.equal((await undo(id, 0)).status, 409);
      assert.equal((await undo(2147483647, 0)).status, 404);
      await client.query(
        "update registrations set event_id='other-event' where id=$1",
        [id],
      );
      assert.equal((await undo(id, 0)).status, 404);
      assert.equal(
        (
          await call(
            getBase(),
            "GET",
            `/admin/registrations/${id}/attendance-corrections`,
            null,
            admin,
          )
        ).status,
        404,
      );
    });
  });
}
