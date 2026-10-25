import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';

/**
 * Any Drizzle Postgres database or transaction: node-postgres in production,
 * PGlite in tests.
 */
export type Database = PgDatabase<PgQueryResultHKT>;

/** Rows from `db.execute()`; both drivers return `{ rows }`. */
export function rowsOf<T>(result: unknown): T[] {
  return (result as { rows: T[] }).rows;
}
