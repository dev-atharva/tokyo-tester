#!/usr/bin/env bash

set -Eeuo pipefail

compose=(docker compose -f docker-compose.yml --profile agent --profile observability)

fail() {
  printf 'prod-verify: %s\n' "$1" >&2
  exit 1
}

"${compose[@]}" ps --status running --services | grep -qx runner || fail "runner is not running"
"${compose[@]}" ps --status running --services | grep -qx ui || fail "UI is not running"
"${compose[@]}" ps --status running --services | grep -qx mcp || fail "MCP server is not running"
"${compose[@]}" ps --status running --services | grep -qx observability || fail "observability UI is not running"

"${compose[@]}" exec -T runner wget -q --spider http://localhost:8080/health || fail "private runner health check failed"
"${compose[@]}" exec -T ui wget -q --spider http://localhost:3000/api/health || fail "private UI readiness check failed"
"${compose[@]}" exec -T mcp wget -q --spider http://localhost:8090/health || fail "private MCP health check failed"

: "${TOKYO_TESTER_PUBLIC_URL:?TOKYO_TESTER_PUBLIC_URL must be set to the public deployment origin}"
public_url=${TOKYO_TESTER_PUBLIC_URL}
logs_headers_file=$(mktemp)
mcp_config_file=$(mktemp)
cleanup_verification() {
  rm -f "$logs_headers_file" "$mcp_config_file"
}
trap cleanup_verification EXIT

curl --fail --silent --show-error --max-time 10 "${public_url%/}/api/health" >/dev/null || fail "public UI readiness check failed"

logs_status=$(curl --silent --show-error --max-time 10 --dump-header "$logs_headers_file" --output /dev/null --write-out '%{http_code}' "${public_url%/}/logs/")
case "$logs_status" in
  301 | 302 | 303 | 307 | 308) ;;
  *) fail "anonymous log viewer request was not redirected to login (HTTP $logs_status)" ;;
esac
grep -Eqi '^location:[[:space:]]*/logs/login' "$logs_headers_file" || fail "anonymous log viewer request did not redirect to /logs/login"
curl --fail --silent --show-error --max-time 10 "${public_url%/}/logs/login" >/dev/null || fail "public log viewer login page failed"

mcp_url=${MCP_PUBLIC_URL:-${public_url%/}/mcp}
: "${MCP_PROD_VERIFY_TOKEN:?MCP_PROD_VERIFY_TOKEN must contain a temporary read token for production verification}"
mcp_token=${MCP_PROD_VERIFY_TOKEN}

if [ "${MCP_AUTH_MODE:-personal_token}" = "oauth" ]; then
  : "${MCP_PROD_VERIFY_TOKEN:?MCP_PROD_VERIFY_TOKEN must contain an OAuth access token for production verification}"
  : "${MCP_VERIFY_PROJECT_ID:?MCP_VERIFY_PROJECT_ID must identify the token audience project}"
  mcp_url="${mcp_url%/}/projects/${MCP_VERIFY_PROJECT_ID}"
fi

chmod 600 "$mcp_config_file"
printf 'header = "Authorization: Bearer %s"\nheader = "Content-Type: application/json"\nheader = "MCP-Protocol-Version: 2025-11-25"\n' "$mcp_token" >"$mcp_config_file"
mcp_response=$(curl --fail --silent --show-error --max-time 15 --config "$mcp_config_file" --request POST --data '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"tokyo_list_projects","arguments":{}}}' "$mcp_url")
printf '%s' "$mcp_response" | grep -Eq '"isError"[[:space:]]*:[[:space:]]*false' || fail "authenticated MCP read check failed"

smoke_response=$("${compose[@]}" exec -T runner sh -c 'payload=/tmp/tokyo-prod-smoke.json; trap '\''rm -f "$payload"'\'' EXIT; cat >"$payload"; wget -qO- --header="Content-Type: application/json" --post-file="$payload" http://localhost:8080/workflow-bundles/run' < scripts/prod-smoke.json)
printf '%s' "$smoke_response" | grep -Eq '"success"[[:space:]]*:[[:space:]]*true' || fail "minimal Docker workflow failed"

managed_containers=$(docker ps -aq --filter label=cots.managed=true | wc -l | tr -d ' ')
managed_networks=$(docker network ls -q --filter label=cots.managed=true | wc -l | tr -d ' ')
[ "$managed_containers" = "0" ] || fail "$managed_containers managed containers leaked after smoke verification"
[ "$managed_networks" = "0" ] || fail "$managed_networks managed networks leaked after smoke verification"

printf 'prod-verify: Compose, public/private health, authenticated log viewer and MCP, Docker workflow execution, and cleanup passed.\n'
