#!/usr/bin/env bash

set -Eeuo pipefail

backup_root=${BACKUP_DIR:-./backups}
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
destination="$backup_root/$timestamp"
backup_image=${MYSQL_BACKUP_IMAGE:-mysql:8.4}
backup_port=${MYSQL_BACKUP_PORT:-3306}
backup_ssl_mode=${MYSQL_BACKUP_SSL_MODE:-REQUIRED}
runner_database=${MYSQL_RUNNER_DATABASE:-tokyo_runner}
ui_database=${MYSQL_UI_DATABASE:-tokyo_ui}

fail() {
  printf 'prod-backup: %s\n' "$1" >&2
  exit 1
}

[ "${RUNNER_DB_TYPE:-mysql}" = "mysql" ] || fail "automatic backup requires RUNNER_DB_TYPE=mysql"
[ "${UI_DB_TYPE:-mysql}" = "mysql" ] || fail "automatic backup requires UI_DB_TYPE=mysql"
: "${MYSQL_BACKUP_HOST:?MYSQL_BACKUP_HOST must identify the external MySQL server}"
: "${MYSQL_BACKUP_USER:?MYSQL_BACKUP_USER must be able to dump both Tokyo Tester databases}"
: "${MYSQL_BACKUP_PASSWORD:?MYSQL_BACKUP_PASSWORD must be set in .env}"
command -v shasum >/dev/null 2>&1 || command -v sha256sum >/dev/null 2>&1 || fail "shasum or sha256sum is required"
case "$backup_port" in
  *[!0-9]* | "") fail "MYSQL_BACKUP_PORT must be numeric" ;;
esac
case "$backup_ssl_mode" in
  DISABLED | PREFERRED | REQUIRED | VERIFY_CA | VERIFY_IDENTITY) ;;
  *) fail "MYSQL_BACKUP_SSL_MODE is invalid" ;;
esac

mkdir -p "$destination"
chmod 700 "$destination"
git rev-parse HEAD > "$destination/DEPLOYED_COMMIT"

MYSQL_PWD="$MYSQL_BACKUP_PASSWORD" docker run --rm \
  --env MYSQL_PWD \
  "$backup_image" \
  mysqldump \
  --host="$MYSQL_BACKUP_HOST" \
  --port="$backup_port" \
  --user="$MYSQL_BACKUP_USER" \
  --ssl-mode="$backup_ssl_mode" \
  --single-transaction \
  --routines \
  --events \
  --hex-blob \
  --no-tablespaces \
  --databases "$runner_database" "$ui_database" \
  > "$destination/tokyo-mysql.sql"

if command -v sha256sum >/dev/null 2>&1; then
  (cd "$destination" && sha256sum tokyo-mysql.sql > SHA256SUMS)
else
  (cd "$destination" && shasum -a 256 tokyo-mysql.sql > SHA256SUMS)
fi

printf 'prod-backup: checksummed external MySQL backup written to %s\n' "$destination"
