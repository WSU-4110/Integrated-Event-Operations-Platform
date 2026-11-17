# NFR-06 isolated environment comparison

Both runs use the same optimized application bundle, fake data shape, 1,000
participants, 100 concurrent users, 5,000 website responses, and 1,000 real bot
handler verifications. The comparison is a single controlled run per profile;
small differences are not statistically established improvements or regressions.

| Check | Local baseline p95 | Isolated profile p95 | Gate | Result |
| --- | ---: | ---: | --- | --- |
| Event-page HTML | 153 ms | 280 ms | p95 <=2,000 ms | PASS |
| Published content | 92 ms | 107 ms | p95 <=2,000 ms | PASS |
| Participant search | 300 ms | 498 ms | every response <=2,000 ms | PASS |
| Dashboard stats | 212 ms | 407 ms | p95 <=2,000 ms | PASS |
| 1,000-row CSV export | 1643 ms | 1888 ms | every response <=10,000 ms | PASS |
| All API responses | 1436 ms | 1572 ms | p95 <=2,000 ms | PASS |
| Discord handler (simulated successful Discord I/O) | 449 ms | 613 ms | every response <=5,000 ms | PASS |

## Created isolated environment

- Runtime follows the repository Dockerfile: Node v24.22.1, production API bundle,
  built website, information packets, and migrations in the deployed directory layout.
- The staged app contains no node_modules or source tree. It runs as the workspace's
  non-root user in a temporary directory, separately from the source build.
- A fresh PostgreSQL 18.6 process has its own data directory, endpoint, test roles,
  and certificate. Connections require TLS and validate the temporary trusted
  certificate and hostname; non-TLS connections are rejected by pg_hba.conf.
- The app is pinned to CPU 0 and given a 256 MiB
  V8 heap limit. PostgreSQL is pinned separately. Application high-water RSS was
  295.2 MiB. The heap limit is not a whole-process RAM limit.
- Browser smoke checks passed at 1440px and 390px with zero application JS errors.
- A real SQL lock timeout returned a controlled error without changing attendance.
- 200 simultaneous check-ins produced one arrival; 200 repeat verifications added
  no links or role grants. Final registrations, links, and accounts remained unique.
- Temporary app/database/certificate files and processes were cleaned up afterward.

## Scope of the evidence

This profile was executed locally using the deployed artifact layout, not by
building a Docker image: Docker is not installed in this workspace. The runtime
and database run on one physical host. No AWS resource or live site was changed.
The exact Lightsail plan, PostgreSQL version/settings, network latency, storage,
CPU throttling and cgroup memory limits could not be verified from the available
access, so this is a **production-style local profile**, not a certified copy of
the team's production hardware.

Discord I/O is still simulated (25ms per successful external operation). The
actual bot handler, service, SQL, permissions, role-assignment logic and response
construction run, but the test creates no real Discord guild, bot registration,
account, message or role. Real Discord latency requires an authenticated Discord
application and test guild; this profile does not manufacture that evidence.
The report therefore keeps live_deployment_validated and full_nfr06_passed false.

## Reproduce the isolated profile

On Linux/WSL with the website and repaired bot already built, install PostgreSQL,
OpenSSL, taskset and Python. Set PERF_PG_BIN to the directory containing initdb
and pg_ctl, and PERF_BOT_DIR to the repaired bot checkout. Then run:

```bash
PERF_PG_BIN=/path/to/postgresql/bin PERF_BOT_DIR=/path/to/nfr06-bot-check bash artifacts/api-server/performance/staging-profile.sh
```

Replace both /path/to values. The script creates and removes its own temporary
cluster; it uses loopback port 55456 for PostgreSQL and 18806 for the app. Do not
run as root, and make sure those ports are free. Set PERF_BROWSER=yes with an
external Playwright installation to repeat the optional browser smoke check.
Raw results: docs/performance/nfr06-staging-results.json.

## Final focused review

Fresh baseline and isolated-profile load/browser runs passed after the final
repairs. Three benchmark helper tests, four bot database-clock/window tests,
84 API regressions, TypeScript checks, and production builds passed.
The database guard now rejects query parameters that could override the apparent
loopback host. The companion bot repair also fixes scanning a later group of
five fresh failures when an older failure precedes them, while preserving expiry.
The full unrelated bot suite is not claimed as passing.

The final expanded browser run also confirmed a real pending-participant check-in,
persistence after reload, duplicate rejection, a downloaded CSV containing 1,000
unique participant emails, and signed-out UI/API protection. Cancel issued no
check-in request. Fixture attendance was reset only inside the disposable test
database before measuring the load phases. External Google OAuth was not exercised;
its login destination was stubbed. These checks passed in both profiles.
