#!/bin/bash

set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT_DIR"

failures=0

pass() { printf 'ok: %s\n' "$1"; }
fail() { printf 'error: %s\n' "$1" >&2; failures=$((failures + 1)); }

require_command() {
    if command -v "$1" >/dev/null 2>&1; then
        pass "$1 is available"
    else
        fail "$1 is required"
    fi
}

port_is_listening() {
    local port=$1
    if command -v lsof >/dev/null 2>&1; then
        lsof -nP -iTCP:"$port" -sTCP:LISTEN -t >/dev/null 2>&1
        return
    fi
    if command -v nc >/dev/null 2>&1; then
        nc -z 127.0.0.1 "$port" >/dev/null 2>&1
        return
    fi
    return 1
}

check_port() {
    local port=$1
    local service=$2
    if port_is_listening "$port"; then
        fail "$service port $port is already occupied; stop the stale process before starting development"
    else
        pass "$service port $port is available"
    fi
}

require_command docker
if command -v docker >/dev/null 2>&1; then
    if docker compose version >/dev/null 2>&1; then
        pass "docker compose is available"
    else
        fail "docker compose is required"
    fi
fi

if [ -f ./.env.docker-socket ]; then
    set -a
    # shellcheck disable=SC1091
    . ./.env.docker-socket
    set +a
else
    fail ".env.docker-socket is missing; run make ensure-docker-socket"
fi

if [ -n "${DOCKER_SOCKET_PATH:-}" ] && docker -H "unix://${DOCKER_SOCKET_PATH}" info >/dev/null 2>&1; then
    pass "Docker daemon is reachable through $DOCKER_SOCKET_PATH"
else
    fail "Docker daemon is not reachable through ${DOCKER_SOCKET_PATH:-the detected socket}"
fi

if [ "${DOCKER_SOCKET_PATH:-/var/run/docker.sock}" != "/var/run/docker.sock" ]; then
    require_command go
    pass "non-standard socket will use the host runner and Compose UI"
else
    pass "standard socket will use the fully containerized stack"
fi

if AUTH_SECRET=doctor-auth-secret \
    WORKFLOW_JOB_ENCRYPTION_KEY="${WORKFLOW_JOB_ENCRYPTION_KEY:-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=}" \
    docker compose -f docker-compose.yml -f docker-compose.dev.yml config --quiet >/dev/null 2>&1; then
    pass "development Compose configuration is valid"
else
    fail "development Compose configuration is invalid"
fi

check_port "${RUNNER_PORT:-8080}" runner
check_port 3000 UI

if [ "$failures" -ne 0 ]; then
    printf 'doctor found %d problem(s)\n' "$failures" >&2
    exit 1
fi

printf 'development environment is ready\n'
