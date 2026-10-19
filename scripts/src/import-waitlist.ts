// Imports the old Replit waitlist (the CSV from the old admin portal's export)
// into the registrations table. Dry run by default; pass --apply to write.
//
//   DATABASE_URL=... DATABASE_SSL_CA=path/to/global-bundle.pem \
//     pnpm --filter @workspace/scripts run import-waitlist -- path/to/waitlist.csv [--apply]
//
// The old waitlist stored class standing in its discord_username column, so
// that column becomes class_standing here. Discord username and team status
// stay empty until the person provides them. People already registered (same
// email) are skipped, so running it twice is safe.

import { readFileSync } from "node:fs";
import {
  CLASS_STANDINGS,
  EXPERIENCE_LEVELS,
  db,
  pool,
  registrationsTable,
} from "@workspace/db";

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

function oneOf<T extends string>(
  value: string,
  allowed: readonly T[],
): T | null {
  const v = value.trim().toLowerCase();
  return (allowed as readonly string[]).includes(v) ? (v as T) : null;
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const apply = args.includes("--apply");
  const path = args.find((a) => !a.startsWith("--"));
  if (!path) {
    console.error("Usage: import-waitlist <waitlist.csv> [--apply]");
    process.exit(1);
  }

  const [header, ...records] = parseCsv(readFileSync(path, "utf8"));
  const col = (name: string) => {
    const i = header.indexOf(name);
    if (i === -1) throw new Error(`The CSV has no "${name}" column.`);
    return i;
  };
  const idx = {
    name: col("name"),
    email: col("email"),
    school: col("school"),
    classStanding: col("discord_username"),
    experience: col("experience_level"),
    createdAt: col("created_at"),
  };

  const rows = [];
  const problems: string[] = [];
  for (const [n, rec] of records.entries()) {
    const line = n + 2;
    const email = rec[idx.email]?.trim().toLowerCase() ?? "";
    const classStanding = oneOf(rec[idx.classStanding] ?? "", CLASS_STANDINGS);
    const experience = oneOf(rec[idx.experience] ?? "", EXPERIENCE_LEVELS);
    const createdAt = new Date(rec[idx.createdAt] ?? "");
    if (!email.includes("@")) problems.push(`line ${line}: missing email`);
    if (!classStanding)
      problems.push(
        `line ${line}: unknown class standing "${rec[idx.classStanding]}"`,
      );
    if (!experience)
      problems.push(
        `line ${line}: unknown experience level "${rec[idx.experience]}"`,
      );
    if (!email.includes("@") || !classStanding || !experience) continue;
    rows.push({
      name: rec[idx.name].trim(),
      email,
      school: rec[idx.school].trim(),
      classStanding,
      experienceLevel: experience,
      source: "waitlist",
      createdAt: Number.isNaN(createdAt.getTime()) ? new Date() : createdAt,
    });
  }

  console.log(
    `${records.length} rows in the CSV, ${rows.length} ready to import.`,
  );
  for (const p of problems) console.log(`  skipped: ${p}`);

  if (!apply) {
    console.log("Dry run: nothing was written. Re-run with --apply to import.");
    await pool.end();
    return;
  }

  const inserted = rows.length
    ? await db
        .insert(registrationsTable)
        .values(rows)
        .onConflictDoNothing()
        .returning({ id: registrationsTable.id })
    : [];
  console.log(
    `Imported ${inserted.length}; ${rows.length - inserted.length} were already registered.`,
  );
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end().catch(() => {});
  process.exit(1);
});
