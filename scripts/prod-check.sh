#!/usr/bin/env bash

set -Eeuo pipefail

compose=(docker compose -f docker-compose.yml --profile agent)

fail() {
  printf 'prod-check: %s\n' "$1" >&2
  exit 1
}

for tool in docker openssl curl tar; do
  command -v "$tool" >/dev/null 2>&1 || fail "required host tool is missing: $tool"
done

docker info >/dev/null 2>&1 || fail "Docker daemon is unavailable to the deployment user"
docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 is unavailable"

: "${AUTH_SECRET:?AUTH_SECRET must be set in .env}"
: "${WORKFLOW_JOB_ENCRYPTION_KEY:?WORKFLOW_JOB_ENCRYPTION_KEY must be set in .env}"

if [ "${AUTH_SECRET}" = "replace-with-a-long-random-secret" ] || [ "${#AUTH_SECRET}" -lt 32 ]; then
  fail "AUTH_SECRET must be a non-placeholder value of at least 32 characters"
fi

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

printf 'prod-check: Docker, secrets, Compose configuration, socket access, and writable volumes are ready.\n'
