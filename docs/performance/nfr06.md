# NFR-06: performance under expected event load

Issue: https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/25

## What this delivers

A repeatable controlled load test against the production website/API builds,
real PostgreSQL, and the actual Discord verification modal handler, service,
repositories, migrations, and database permissions. No new application dependency
is needed. The website patch reduces Discord bulk lookups to one bound PostgreSQL
array, avoiding 1,000 generated SQL parameters per export. The first run with all
1,000 registrations linked failed the aggregate two-second API gate; the same
workload passed after this query change. Before/after results accompany this PR.

The bot checkout currently has an independent build/runtime bug in its database
clock query. Apply the companion `NFR06-bot-clock.patch` to an isolated checkout
of Discord-Bot; its regression tests cover the clock query and lockout window; each reported bug was reproduced before its repair.
Keep that repair in its own PR targeting Discord-Bot. This website PR targets main.

## Workload and assertions

- Seed exactly 1,000 fake registrations, split between pending and approved.
- Use 100 independent authenticated organizer sessions and 100 concurrent workers.
- Run 1,000 requests each for HTML, published content, search, stats, and CSV:
  5,000 responses total, all checked for correct content/status and body completion.
- Require per-scenario p95 <=2 seconds for HTML/content/search/stats and aggregate
  p95 <=2 seconds over all 4,000 API responses, including exports.
- Require every search first page <=2 seconds and every 1,000-row export <=10 seconds.
- Verify 1,000 distinct registrations through the real bot handler using 100 workers
  and the production-sized 10-connection restricted-role pool. Require every verified
  response <=5 seconds, a saved link, and a confirmed Participant role in the simulation.
- Run 200 duplicate verification submissions: no additional links or role grants.
- Run 200 competing check-ins for one active participant: one success and 199 conflicts.
- Inject a real PostgreSQL lock timeout on a separate private test-server restart:
  JSON error, bounded response, and unchanged attendance.
- Assert final row/link/account uniqueness and attendance counts.

Discord gateway/member/role/reply/log calls are **simulated successful operations
with 25ms latency each**. No Discord token, live guild, real inbox, or production
participant data is used. This is a measured database/handler integration test,
not a measurement of the deployed Discord service. Report fields distinguish
`controlled_suite_passed` from `live_deployment_validated` and `full_nfr06_passed`.
The latter two remain false. Do not close #25 solely on this local report: repeat
on production-equivalent isolated staging and verify a normal real Discord flow
before claiming the entire nonfunctional requirement is validated in deployment.

The page load test measures HTML delivery, not browser LCP. Optional Playwright
smoke checks exercise actual rendered content/search/check-in controls and widths.
The load is short and closed-loop with no think time; it is not an endurance test
or a claim about AWS capacity. Database/server/client share the local test host.

## Reproduce (Git Bash, from repository root)

Requires Node 22+, pnpm, Docker, Git, and a fresh disposable PostgreSQL database.
Never point the loopback connection at a tunnel to event data. The runner refuses
non-loopback database hosts and requires `PERF_DISPOSABLE_DB=yes`; it also refuses
to seed a database that already contains registrations. It starts/stops its own
production server on port 18806. The fake data remains for inspection afterward.

Build the website:

```bash
pnpm install --frozen-lockfile
pnpm exec tsc --build
pnpm --filter @workspace/api-server build
PORT=18806 BASE_PATH=/ pnpm --filter @workspace/hackathon build
```

Prepare the separate bot checkout without changing the live bot branch:

```bash
git clone --single-branch --branch Discord-Bot https://github.com/WSU-4110/Integrated-Event-Operations-Platform.git ../nfr06-bot-check
cd ../nfr06-bot-check
git switch -c arian/nfr-06-bot-clock
git apply --check ~/Downloads/NFR06-bot-clock.patch
git apply ~/Downloads/NFR06-bot-clock.patch
npm ci
npm run build
cd ../assignment4-team
```

Use your actual website folder name in the last command if it differs. The tested
bot source is commit `80ac0e9d838d4ffdea1f03e4a8892ca1bd6749c9` plus the companion
repair. If Discord-Bot has changed, review/retest instead of assuming old evidence.

Start a fresh isolated database (requires a superuser to create the local bot role):

```bash
docker run --name nfr06-test-db -e POSTGRES_USER=nfrtester -e POSTGRES_PASSWORD=perf-local -e POSTGRES_DB=nfr06 -p 127.0.0.1:55455:5432 -d postgres:16
docker exec nfr06-test-db pg_isready -U nfrtester -d nfr06
```

Wait until accepting connections, then run:

```bash
node --test artifacts/api-server/performance/metrics.test.mjs
PERF_BOT_DIR=../nfr06-bot-check PERF_DISPOSABLE_DB=yes TEST_DATABASE_URL=postgresql://nfrtester:perf-local@127.0.0.1:55455/nfr06 PERF_REPORT=nfr06-results.json node artifacts/api-server/performance/run.mjs
```

For a website-only diagnostic run, explicitly set `PERF_WEB_ONLY=yes` and omit
PERF_BOT_DIR. That cannot pass the full controlled-suite flag. For repeated runs,
remove only the disposable container (`docker rm -f nfr06-test-db`) and create it
again. Never delete or reset an event database to rerun this test.

Optional browser smoke check: provide an externally installed Playwright module
using `PERF_PLAYWRIGHT_MODULE` (file URL to its index.mjs) and set `PERF_BROWSER=yes`.
If necessary, set `PERF_CHROMIUM` to a compatible headless executable. These tools
are developer-only; they are not added to application dependencies.

## Verification notes

The website API regression suite passed 84 tests with no failures or skips;
TypeScript checks and both website builds passed. The repaired bot build and the
four database-clock/window regression tests passed; the real-PostgreSQL handler benchmark
also passed. The full unrelated bot suite was stopped to honor the requested time
limit and is **not** claimed as passing. This PR should be reviewed with its scope
and external-service simulation limits visible.

## Suggested PR title and description

Title: `NFR-06: Add performance benchmarks and optimize bulk Discord lookups`

```text
Refs #25

Adds repeatable 1,000-participant / 100-user performance tests for the production
website/API and real PostgreSQL. Optimizes bulk Discord lookups using one bound
array. Includes timings, CSV/search validation, duplicate check-in/verification
checks, timeout handling, and data-integrity assertions.

The actual Discord handler is benchmarked with a restricted database role and
simulated successful Discord I/O. Its current clock-query bug is repaired in a
separate companion patch targeting Discord-Bot.

Controlled local checks passed. Actual Discord latency and production-equivalent
staging performance still need validation, so this PR does not close #25.
Leave unmerged for review.
```

## Additional isolated production-style validation

The runtime artifact/TLS/resource profile was created and tested locally after
the baseline. All load, timeout, integrity, and browser gates passed. See
[nfr06-staging-comparison.md](nfr06-staging-comparison.md) and the raw
[nfr06-staging-results.json](nfr06-staging-results.json). The report documents
the CPU/heap settings and remaining differences from the actual AWS/Discord setup.

## Final review fixes

The local-database guard rejects URL query strings and fragments, preventing
query parameters from overriding the loopback database hostname. Its new
regression first failed, then passed after the repair (3 helper tests total).
The companion bot patch also slides the entire failure window correctly when
an older failure precedes five fresh failures. Tests reproduced that defect;
all 4 clock/window regressions now pass, including expired-lockout behavior.
The final load/browser reports were regenerated after these repairs.

The final browser checks include actual successful pending-participant check-in,
reload persistence, cancel without a request, duplicate rejection, a real CSV
download with 1,000 unique emails, and signed-out protection. They pass in both
profiles at desktop/mobile widths with zero application JavaScript errors.
Only disposable fixture attendance is reset before the measured load phases.
