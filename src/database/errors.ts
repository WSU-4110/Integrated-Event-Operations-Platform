interface PgErrorFields {
  code?: string;
  constraint?: string;
}

// Drizzle wraps driver errors (DrizzleQueryError), with the original in `cause`.
function pgError(err: unknown): PgErrorFields | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const e = err as PgErrorFields & { cause?: unknown };
  if (e.code) return e;
  return pgError(e.cause);
}

/** True for a unique violation (SQLSTATE 23505), optionally on one constraint. */
export function isUniqueViolation(err: unknown, constraint?: string): boolean {
  const e = pgError(err);
  return e?.code === '23505' && (constraint === undefined || e.constraint === constraint);
}
