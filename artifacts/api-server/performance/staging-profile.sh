#!/usr/bin/env bash
# Isolated Linux runtime matching the repo Dockerfile's artifact layout.
# No Docker/AWS deployment, live data, or real Discord calls.
set -euo pipefail
repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
: "${PERF_BOT_DIR:?Set PERF_BOT_DIR to the prepared bot checkout}"
: "${PERF_PG_BIN:?Set PERF_PG_BIN to a local PostgreSQL bin directory}"
bot_root=$(cd "$PERF_BOT_DIR" && pwd)
for cmd in openssl taskset node python3; do command -v "$cmd" >/dev/null; done
stage=$(mktemp -d)
trap '"$PERF_PG_BIN/pg_ctl" -D "$stage/pg" -m fast stop >/dev/null 2>&1 || true; rm -rf "$stage"' EXIT
mkdir -p "$stage/app/artifacts/api-server" "$stage/app/artifacts/hackathon/dist" "$stage/app/lib/db" "$stage/certs"
cp -a "$repo_root/artifacts/api-server/dist" "$stage/app/artifacts/api-server/"
cp -a "$repo_root/artifacts/hackathon/dist/public" "$stage/app/artifacts/hackathon/dist/"
cp -a "$repo_root/lib/db/drizzle" "$stage/app/lib/db/"
cp -a "$repo_root/attached_assets" "$stage/app/"
# Guard that the staged service has only deployable artifacts, not a source tree.
test ! -d "$stage/app/node_modules"
"$PERF_PG_BIN/initdb" -D "$stage/pg" -U nfrtester -A trust --no-locale --encoding=UTF8 > "$stage/init.log" 2>&1
openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 1 \
  -subj '/CN=localhost' -addext 'subjectAltName=DNS:localhost,IP:127.0.0.1' \
  -keyout "$stage/certs/server.key" -out "$stage/certs/server.crt" >/dev/null 2>&1
chmod 600 "$stage/certs/server.key"
cat > "$stage/pg/pg_hba.conf" <<'HBA'
hostssl all all 127.0.0.1/32 trust
hostnossl all all 127.0.0.1/32 reject
HBA
read -r app_cpu db_cpu < <(python3 - <<'PY'
import os
cpus=sorted(os.sched_getaffinity(0))
print(cpus[0],cpus[1] if len(cpus)>1 else cpus[0])
PY
)
# DB workers inherit the second CPU; the application is independently pinned.
taskset -c "$db_cpu" "$PERF_PG_BIN/pg_ctl" -D "$stage/pg" -l "$stage/pg.log" \
  -o "-h 127.0.0.1 -p 55456 -c unix_socket_directories= -c ssl=on -c ssl_cert_file=$stage/certs/server.crt -c ssl_key_file=$stage/certs/server.key" -w start >/dev/null
cd "$repo_root"
PERF_PROFILE=isolated-production-style \
PERF_SERVER_FILE="$stage/app/artifacts/api-server/dist/index.mjs" \
PERF_SERVER_CPU="$app_cpu" PERF_SERVER_HEAP_MB=256 \
PERF_DB_SSL_CA="$stage/certs/server.crt" PERF_BOT_DIR="$bot_root" \
PERF_DISPOSABLE_DB=yes TZ=UTC \
TEST_DATABASE_URL=postgresql://nfrtester@127.0.0.1:55456/postgres \
PERF_REPORT="${PERF_STAGING_REPORT:-docs/performance/nfr06-staging-results.json}" \
node artifacts/api-server/performance/run.mjs
