#!/usr/bin/env bash

set -Eeuo pipefail

compose=(docker compose -f docker-compose.yml --profile agent)

fail() {
  printf 'prod-check: %s\n' "$1" >&2
  exit 1
}

for tool in docker openssl curl; do
  command -v "$tool" >/dev/null 2>&1 || fail "required host tool is missing: $tool"
done

docker info >/dev/null 2>&1 || fail "Docker daemon is unavailable to the deployment user"
docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 is unavailable"

: "${AUTH_SECRET:?AUTH_SECRET must be set in .env}"
: "${WORKFLOW_JOB_ENCRYPTION_KEY:?WORKFLOW_JOB_ENCRYPTION_KEY must be set in .env}"
: "${RUNNER_DATABASE_URL:?RUNNER_DATABASE_URL must point to the external tokyo_runner MySQL database}"
: "${UI_DATABASE_URL:?UI_DATABASE_URL must point to the external tokyo_ui MySQL database}"
: "${TOKYO_TESTER_PUBLIC_ORIGIN:?TOKYO_TESTER_PUBLIC_ORIGIN must be set in .env}"
: "${MCP_INTERNAL_SECRET:?MCP_INTERNAL_SECRET must be set in .env}"

[ "${RUNNER_DB_TYPE:-mysql}" = "mysql" ] || fail "production requires RUNNER_DB_TYPE=mysql"
[ "${UI_DB_TYPE:-mysql}" = "mysql" ] || fail "production requires UI_DB_TYPE=mysql"
case "${RUNNER_DATABASE_URL}" in
  mysql://*) ;;
  *) fail "RUNNER_DATABASE_URL must use a mysql:// URL" ;;
esac
case "${UI_DATABASE_URL}" in
  mysql://*) ;;
  *) fail "UI_DATABASE_URL must use a mysql:// URL" ;;
esac
case "${RUNNER_DATABASE_URL}${UI_DATABASE_URL}" in
  *replace-with*) fail "production database URLs still contain placeholder credentials" ;;
esac

case "${TOKYO_TESTER_PUBLIC_ORIGIN}" in
  https://*) ;;
  *) fail "TOKYO_TESTER_PUBLIC_ORIGIN must use HTTPS in production" ;;
esac

MCP_PUBLIC_URL=${MCP_PUBLIC_URL:-${TOKYO_TESTER_PUBLIC_ORIGIN%/}/mcp}
export MCP_PUBLIC_URL
case "${MCP_PUBLIC_URL}" in
  https://*/mcp) ;;
  *) fail "MCP_PUBLIC_URL must be an HTTPS URL ending in /mcp" ;;
esac

if [ "${AUTH_SECRET}" = "replace-with-a-long-random-secret" ] || [ "${#AUTH_SECRET}" -lt 32 ]; then
  fail "AUTH_SECRET must be a non-placeholder value of at least 32 characters"
fi

if [ "${MCP_INTERNAL_SECRET}" = "replace-with-a-separate-long-random-secret" ] || [ "${#MCP_INTERNAL_SECRET}" -lt 32 ]; then
  fail "MCP_INTERNAL_SECRET must be a separate non-placeholder value of at least 32 characters"
fi
if [ "${MCP_INTERNAL_SECRET}" = "${AUTH_SECRET}" ]; then
  fail "MCP_INTERNAL_SECRET must be different from AUTH_SECRET"
fi

case "${MCP_AUTH_MODE:-personal_token}" in
  personal_token) ;;
  oauth)
    : "${MCP_OAUTH_ISSUER:?MCP_OAUTH_ISSUER must be set when MCP_AUTH_MODE=oauth}"
    : "${MCP_OAUTH_INTROSPECTION_URL:?MCP_OAUTH_INTROSPECTION_URL must be set when MCP_AUTH_MODE=oauth}"
    : "${MCP_OAUTH_CLIENT_ID:?MCP_OAUTH_CLIENT_ID must be set when MCP_AUTH_MODE=oauth}"
    : "${MCP_OAUTH_CLIENT_SECRET:?MCP_OAUTH_CLIENT_SECRET must be set when MCP_AUTH_MODE=oauth}"
    case "${MCP_OAUTH_ISSUER}" in https://*) ;; *) fail "MCP_OAUTH_ISSUER must use HTTPS" ;; esac
    case "${MCP_OAUTH_INTROSPECTION_URL}" in https://*) ;; *) fail "MCP_OAUTH_INTROSPECTION_URL must use HTTPS" ;; esac
    ;;
  *) fail "MCP_AUTH_MODE must be personal_token or oauth" ;;
esac

decoded_key_length=$(printf '%s' "${WORKFLOW_JOB_ENCRYPTION_KEY}" | openssl base64 -d -A 2>/dev/null | wc -c | tr -d ' ')
if [ "$decoded_key_length" != "32" ]; then
  fail "WORKFLOW_JOB_ENCRYPTION_KEY must be a base64-encoded 32-byte key"
fi

socket_path=${DOCKER_SOCKET_PATH:-/var/run/docker.sock}
[ -S "$socket_path" ] || fail "Docker socket is not a Unix socket: $socket_path"
[ -r "$socket_path" ] && [ -w "$socket_path" ] || fail "Docker socket is not readable and writable by the deployment user"

"${compose[@]}" config --quiet

probe_volume="tokyo-tester-prod-check-$$"
cleanup_probe() {
  docker volume rm "$probe_volume" >/dev/null 2>&1 || true
}
trap cleanup_probe EXIT
docker volume create "$probe_volume" >/dev/null
docker run --rm --volume "$probe_volume:/probe" alpine:3.22 sh -c 'touch /probe/write-check && test -w /probe/write-check' >/dev/null

printf 'prod-check: Docker, external MySQL URLs, secrets, Compose configuration, socket access, and writable volumes are ready.\n'
