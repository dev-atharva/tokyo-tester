#!/usr/bin/env bash
set -euo pipefail

E2E_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOPOLOGY="${1:-}"
TEST_NAME="a UI-authored browser journey resolves a human secret and renders durable failure evidence"

case "$TOPOLOGY" in
  compose-linux)
    if [[ "$(uname -s)" != "Linux" ]]; then
      printf 'Browser release gate requires a dedicated Linux host; found %s.\n' "$(uname -s)" >&2
      exit 2
    fi
    docker_os="$(docker info --format '{{.OperatingSystem}}')"
    if [[ "$docker_os" == *"Docker Desktop"* ]]; then
      printf 'Docker Desktop is not production sandbox evidence: %s\n' "$docker_os" >&2
      exit 2
    fi
    export E2E_RUNNER_APP_ENV=production
    export E2E_BROWSER_CHROMIUM_SANDBOX=true
    unset E2E_BASE_URL E2E_KUBERNETES_NAMESPACE
    ;;
  kubernetes)
    : "${E2E_BASE_URL:?Set E2E_BASE_URL to the deployed Tokyo Tester origin}"
    : "${E2E_KUBERNETES_NAMESPACE:?Set E2E_KUBERNETES_NAMESPACE to the deployed namespace}"
    kubectl get deployment tokyo-runner \
      --namespace "$E2E_KUBERNETES_NAMESPACE" >/dev/null
    runner_environment="$(kubectl get deployment tokyo-runner \
      --namespace "$E2E_KUBERNETES_NAMESPACE" \
      --output jsonpath='{range .spec.template.spec.containers[?(@.name=="runner")].env[*]}{.name}={.value}{"\n"}{end}')"
    if [[ "$runner_environment" != *$'APP_ENV=production'* ]] || \
       [[ "$runner_environment" != *$'BROWSER_CHROMIUM_SANDBOX=true'* ]]; then
      printf 'Live runner must declare APP_ENV=production and BROWSER_CHROMIUM_SANDBOX=true.\n' >&2
      exit 2
    fi
    ;;
  *)
    printf 'Usage: %s compose-linux|kubernetes\n' "$0" >&2
    exit 2
    ;;
esac

cd "$E2E_DIR"
exec bun run test:docker --grep "$TEST_NAME"
