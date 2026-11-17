export function summarize(samples, limit) {
  const sorted = samples.map(s => s.ms).sort((a,b) => a-b);
  const failures = samples.filter(s => !s.ok || !Number.isFinite(s.ms)).length;
  const p95 = sorted[Math.ceil(sorted.length * .95)-1] ?? null;
  return {requests:samples.length, failures, p95_ms:p95, max_ms:sorted.at(-1) ?? null,
    limit_ms:limit, passed:samples.length>0 && failures===0 && p95<=limit};
}
export function assertLocalDatabase(value, acknowledgement) {
  const url = new URL(value);
  if (!['postgres:','postgresql:'].includes(url.protocol) ||
      url.search !== '' || url.hash !== '' ||
      !['localhost','127.0.0.1','[::1]'].includes(url.hostname) || acknowledgement!=='yes')
    throw new Error('Use a disposable loopback PostgreSQL database and PERF_DISPOSABLE_DB=yes. Never tunnel to production.');
}
