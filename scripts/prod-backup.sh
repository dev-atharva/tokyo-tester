#!/usr/bin/env bash

set -Eeuo pipefail

compose=(docker compose -f docker-compose.yml --profile agent)
backup_root=${BACKUP_DIR:-./backups}
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
destination="$backup_root/$timestamp"

fail() {
  printf 'prod-backup: %s\n' "$1" >&2
  exit 1
}

[ "${RUNNER_DB_TYPE:-mysql}" = "mysql" ] || fail "automatic backup requires RUNNER_DB_TYPE=mysql"
[ "${UI_DB_TYPE:-mysql}" = "mysql" ] || fail "automatic backup requires UI_DB_TYPE=mysql"
: "${MYSQL_ROOT_PASSWORD:?MYSQL_ROOT_PASSWORD must be set in .env}"
command -v shasum >/dev/null 2>&1 || command -v sha256sum >/dev/null 2>&1 || fail "shasum or sha256sum is required"

mkdir -p "$destination"
chmod 700 "$destination"
git rev-parse HEAD > "$destination/DEPLOYED_COMMIT"

"${compose[@]}" exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysqldump --user=root --single-transaction --routines --events --hex-blob --no-tablespaces --databases tokyo_runner tokyo_ui' > "$destination/tokyo-mysql.sql"

if command -v sha256sum >/dev/null 2>&1; then
  (cd "$destination" && sha256sum tokyo-mysql.sql > SHA256SUMS)
else
  (cd "$destination" && shasum -a 256 tokyo-mysql.sql > SHA256SUMS)
fi

printf 'prod-backup: checksummed MySQL backup written to %s\n' "$destination"
