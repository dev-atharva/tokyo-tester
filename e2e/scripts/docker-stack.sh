#!/usr/bin/env bash
set -euo pipefail

E2E_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT_DIR="$(cd "$E2E_DIR/.." && pwd)"
COMPOSE_FILE="$E2E_DIR/stacks/docker-compose.yml"
PROJECT_NAME="tokyo-tester-e2e-docker"
ARTIFACT_DIR="${E2E_ARTIFACT_DIR:-$E2E_DIR/artifacts/docker}/stack"

if [[ "$ARTIFACT_DIR" != /* ]]; then
  ARTIFACT_DIR="$E2E_DIR/$ARTIFACT_DIR"
fi
mkdir -p "$ARTIFACT_DIR"

if [[ -z "${DOCKER_SOCKET_PATH:-}" && -f "$ROOT_DIR/.env.docker-socket" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env.docker-socket"
  set +a
fi

compose() {
  docker compose --project-name "$PROJECT_NAME" --file "$COMPOSE_FILE" "$@"
}

cleanup() {
  local exit_code=$?
  trap - EXIT INT TERM
  compose ps --all >"$ARTIFACT_DIR/compose-ps.txt" 2>&1 || true
  compose logs --no-color >"$ARTIFACT_DIR/compose.log" 2>&1 || true
  if [[ "${E2E_KEEP_STACK:-0}" == "1" ]]; then
    printf 'Keeping Docker E2E stack %s at http://127.0.0.1:3100\n' "$PROJECT_NAME"
  else
    compose down --volumes --remove-orphans --timeout 10 >/dev/null 2>&1 || true
  fi
  exit "$exit_code"
}
trap cleanup EXIT INT TERM

command -v docker >/dev/null || { printf 'Docker is required.\n' >&2; exit 1; }
docker info >/dev/null
docker build --tag tokyo-test-api:latest "$ROOT_DIR/test-api"
docker build --file "$ROOT_DIR/runner-v2/browser-executor/Dockerfile" \
  --tag tokyo-tester-browser-executor:1.61.0 "$ROOT_DIR/runner-v2"

compose down --volumes --remove-orphans --timeout 5 >/dev/null 2>&1 || true
compose up --detach registry
for _ in {1..60}; do
  if curl --fail --silent --user 'e2e-runner:tokyo-e2e-registry-password' \
    http://127.0.0.1:5100/v2/ >/dev/null; then
    break
  fi
  sleep 1
done
curl --fail --silent --user 'e2e-runner:tokyo-e2e-registry-password' \
  http://127.0.0.1:5100/v2/ >/dev/null

REGISTRY_DOCKER_CONFIG="$ARTIFACT_DIR/registry-docker-config"
mkdir -p "$REGISTRY_DOCKER_CONFIG"
printf '%s' 'tokyo-e2e-registry-password' | docker --config "$REGISTRY_DOCKER_CONFIG" \
  login 127.0.0.1:5100 --username e2e-runner --password-stdin >/dev/null
docker tag tokyo-test-api:latest 127.0.0.1:5100/team/platform/api:e2e
docker --config "$REGISTRY_DOCKER_CONFIG" push \
  127.0.0.1:5100/team/platform/api:e2e >/dev/null
docker image rm 127.0.0.1:5100/team/platform/api:e2e >/dev/null

compose up --detach --build --wait
printf 'Docker E2E stack is ready at http://127.0.0.1:3100\n'

while true; do
  sleep 3600 &
  wait $!
done
