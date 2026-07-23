#!/usr/bin/env bash

set -Eeuo pipefail

destination=${1:-./production-baseline-$(date -u +%Y%m%dT%H%M%SZ)}
mkdir -p "$destination"
chmod 700 "$destination"

git rev-parse HEAD > "$destination/deployed-commit.txt"
git status --short > "$destination/tracked-status.txt"
git diff --stat > "$destination/tracked-patch-stat.txt"
git diff --binary | sed -E '/(secret|password|token|credential|database_url|auth_url|private_key)/I s/^([+-][^:=]*[:=]).*/\1 <redacted>/' > "$destination/tracked-files.redacted.patch"
docker version --format 'client={{.Client.Version}} server={{.Server.Version}}' > "$destination/docker-version.txt"
docker compose version > "$destination/compose-version.txt"
docker compose -f docker-compose.yml --profile agent config --services > "$destination/compose-services.txt"
docker compose -f docker-compose.yml --profile agent config --volumes > "$destination/compose-volumes.txt"

if [ -f .env ]; then
  sed -n -E 's/^[[:space:]]*(export[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*)=.*/\2/p' .env | sort -u > "$destination/environment-variable-names.txt"
else
  : > "$destination/environment-variable-names.txt"
fi

if [ -f .env.docker-socket ]; then
  sed -n -E '/^(DOCKER_SOCKET_PATH|CONTAINER_DOCKER_SOCKET_PATH|RUNNER_DOCKER_HOST|TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE)=/p' .env.docker-socket > "$destination/docker-socket-layout.txt"
else
  : > "$destination/docker-socket-layout.txt"
fi

printf 'Production baseline written to %s. Review the redacted patch before moving it off-host.\n' "$destination"
