#!/usr/bin/env bash

set -Eeuo pipefail

compose=(docker compose -f docker-compose.yml --profile agent)

fail() {
  printf 'prod-verify: %s\n' "$1" >&2
  exit 1
}

"${compose[@]}" ps --status running --services | grep -qx runner || fail "runner is not running"
"${compose[@]}" ps --status running --services | grep -qx ui || fail "UI is not running"
"${compose[@]}" ps --status running --services | grep -qx mcp || fail "MCP server is not running"
"${compose[@]}" ps --status running --services | grep -qx mysql || fail "MySQL is not running"

"${compose[@]}" exec -T runner wget -q --spider http://localhost:8080/health || fail "private runner health check failed"
"${compose[@]}" exec -T ui wget -q --spider http://localhost:3000/api/health || fail "private UI readiness check failed"
"${compose[@]}" exec -T mcp wget -q --spider http://localhost:8090/health || fail "private MCP health check failed"

: "${TOKYO_TESTER_PUBLIC_URL:?TOKYO_TESTER_PUBLIC_URL must be set to the public deployment origin}"
public_url=${TOKYO_TESTER_PUBLIC_URL}
curl --fail --silent --show-error --max-time 10 "${public_url%/}/api/health" >/dev/null || fail "public UI readiness check failed"

smoke_response=$("${compose[@]}" exec -T runner sh -c 'payload=/tmp/tokyo-prod-smoke.json; trap '\''rm -f "$payload"'\'' EXIT; cat >"$payload"; wget -qO- --header="Content-Type: application/json" --post-file="$payload" http://localhost:8080/workflow-bundles/run' < scripts/prod-smoke.json)
printf '%s' "$smoke_response" | grep -Eq '"success"[[:space:]]*:[[:space:]]*true' || fail "minimal Docker workflow failed"

managed_containers=$(docker ps -aq --filter label=cots.managed=true | wc -l | tr -d ' ')
managed_networks=$(docker network ls -q --filter label=cots.managed=true | wc -l | tr -d ' ')
[ "$managed_containers" = "0" ] || fail "$managed_containers managed containers leaked after smoke verification"
[ "$managed_networks" = "0" ] || fail "$managed_networks managed networks leaked after smoke verification"

printf 'prod-verify: Compose, public/private health, Docker workflow execution, and cleanup passed.\n'
