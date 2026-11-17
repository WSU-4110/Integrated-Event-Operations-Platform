import { before, after, describe, test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";

export function eventScheduleTests({ getBase, call, databaseUrl }) {
  describe("FR-12 event schedule", () => {
    let client;
    const run = Date.now().toString(36);
    const title = (name) => `FR-12 ${run} ${name}`;
    const insert = (name, start, published, eventId = "builderwars-2026") =>
      client.query(
        `insert into event_schedule
           (event_id, title, location, start_time, end_time, published)
         values ($1, $2, 'Student Center', $3, $3::timestamptz + interval '1 hour', $4)`,
        [eventId, title(name), start, published],
      );

    before(async () => {
      client = new pg.Client({ connectionString: databaseUrl });
      await client.connect();
      await insert("lunch", "2026-11-14T18:00:00Z", true);
      await insert("opening", "2026-11-14T16:00:00Z", true);
      await insert("draft", "2026-11-14T17:00:00Z", false);
      await insert("other event", "2026-11-14T15:00:00Z", true, "another-event");
    });

    after(async () => {
      if (client) {
        await client.query("delete from event_schedule where title like $1", [
          `FR-12 ${run} %`,
        ]);
        await client.end();
      }
    });

    test("lists only this event's published sessions, in time order", async () => {
      const res = await call(getBase(), "GET", "/event-schedule");
      assert.equal(res.status, 200);
      assert.equal(res.headers.get("cache-control"), "no-cache");
      const mine = JSON.parse(res.text).filter((item) =>
        item.title.startsWith(`FR-12 ${run} `),
      );
      assert.deepEqual(
        mine.map((item) => item.title),
        [title("opening"), title("lunch")],
      );
      assert.deepEqual(Object.keys(mine[0]).sort(), [
        "description",
        "endTime",
        "id",
        "location",
        "position",
        "startTime",
        "title",
      ]);
    });
  });
}
