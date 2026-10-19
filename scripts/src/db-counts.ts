// Prints record counts (no personal data) so a restored backup can be
// compared with the live database. See docs/deployment.md, "Restore test".
//
//   DATABASE_URL=... DATABASE_SSL_CA=path/to/global-bundle.pem \
//     pnpm --filter @workspace/scripts run db-counts

import { pool } from "@workspace/db";

const QUERIES: [string, string][] = [
  ["registrations", "select count(*) from registrations"],
  [
    "registrations by status",
    "select status, count(*) from registrations group by status order by status",
  ],
  [
    "registrations by source",
    "select source, count(*) from registrations group by source order by source",
  ],
  ["status changes", "select count(*) from registration_status_changes"],
  ["latest registration", "select max(created_at) from registrations"],
  ["organizer accounts", "select count(*) from users"],
];

async function main() {
  for (const [label, sql] of QUERIES) {
    const { rows } = await pool.query(sql);
    const value =
      rows.length === 1 && Object.keys(rows[0]).length === 1
        ? String(Object.values(rows[0])[0])
        : rows.map((r) => Object.values(r).join(": ")).join(", ");
    console.log(`${label.padEnd(26)} ${value}`);
  }
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end().catch(() => {});
  process.exit(1);
});
