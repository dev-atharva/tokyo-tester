#!/usr/bin/env bash

set -Eeuo pipefail

compose=(docker compose -f docker-compose.yml --profile agent)
backup_root=${BACKUP_DIR:-./backups}
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
destination="$backup_root/$timestamp"
stopped=0

fail() {
  printf 'prod-backup: %s\n' "$1" >&2
  exit 1
}

[ "${RUNNER_DB_TYPE:-sqlite}" = "sqlite" ] || fail "automatic backup currently supports only the runner SQLite database"
[ "${UI_DB_TYPE:-sqlite}" = "sqlite" ] || fail "automatic backup currently supports only the UI SQLite database"
command -v shasum >/dev/null 2>&1 || command -v sha256sum >/dev/null 2>&1 || fail "shasum or sha256sum is required"

mkdir -p "$destination"
chmod 700 "$destination"
git rev-parse HEAD > "$destination/DEPLOYED_COMMIT"

restart_stack() {
  if [ "$stopped" = "1" ]; then
    "${compose[@]}" up -d --wait
  fi
}
trap restart_stack EXIT

"${compose[@]}" stop edge mcp ui runner
stopped=1

"${compose[@]}" run --rm -T --no-deps --entrypoint tar runner -C /app/data -cf - . > "$destination/runner-data.tar"
"${compose[@]}" run --rm -T --no-deps --entrypoint tar ui -C /app/data -cf - . > "$destination/ui-data.tar"

if command -v sha256sum >/dev/null 2>&1; then
  (cd "$destination" && sha256sum runner-data.tar ui-data.tar > SHA256SUMS)
else
  (cd "$destination" && shasum -a 256 runner-data.tar ui-data.tar > SHA256SUMS)
fi

restart_stack
stopped=0
trap - EXIT

printf 'prod-backup: checksummed database archives written to %s\n' "$destination"
