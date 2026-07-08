.DEFAULT_GOAL := help

COMPOSE := docker compose
COMPOSE_FILES := -f docker-compose.yml
DEV_COMPOSE_FILES := -f docker-compose.yml -f docker-compose.dev.yml
SOCKET_ENV_FILE := .env.docker-socket
DEV_SECRETS = AUTH_SECRET="$${AUTH_SECRET:-local-dev-auth-secret}" WORKFLOW_JOB_ENCRYPTION_KEY="$${WORKFLOW_JOB_ENCRYPTION_KEY:-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=}"
UI_RUNNER_CHECK_PATHS := proxy.ts package.json src/app/layout.tsx src/app/globals.css src/app/api/v1/workflow-runs src/modules/sync/sync-hydration.tsx src/modules/workflow/hooks/useRealtimeLogs.tsx src/modules/workflow/hooks/useWorkflowExecution.tsx src/modules/workflow/lib src/modules/workflow/server src/modules/workflow/stores/execution.store.sync.ts src/modules/workflow/types/workflow-run-input.contract.test.ts
ENV_LOADER = set -a; \
	if [ -f ./$(SOCKET_ENV_FILE) ]; then . ./$(SOCKET_ENV_FILE); fi; \
	if [ -f ./.env ]; then . ./.env; fi; \
	set +a;

.PHONY: help ensure-docker-socket doctor dev dev-docker dev-host-runner dev-local dev-support runner-dev ui-dev agent-dev prod down reset test test-go test-ui test-test-api test-api-build test-complex-e2e check compose-check

help: ## Show available commands
	@printf "Tokyo Tester commands\n\n"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  %-8s %s\n", $$1, $$2}'
	@printf "\nOptional env: use .env for app overrides. Docker socket settings are auto-detected into $(SOCKET_ENV_FILE).\n"

ensure-docker-socket: ## Detect the Docker socket and write .env.docker-socket
	@bash ./scripts/detect-docker-socket.sh

doctor: ensure-docker-socket ## Check Docker, Compose, host tools, configuration, and development ports
	@bash ./scripts/dev-doctor.sh

dev: doctor ## Run the dev stack; auto-falls back to a host runner for non-standard Docker Sockets
	@$(ENV_LOADER) \
	if [ "$${DOCKER_SOCKET_PATH:-/var/run/docker.sock}" = "/var/run/docker.sock" ]; then \
		printf "Using fully dockerized dev stack.\n"; \
		$(MAKE) dev-docker; \
	else \
		printf "Detected non-standard Docker socket %s.\n" "$${DOCKER_SOCKET_PATH}"; \
		printf "Starting the UI in Docker and the runner on the host.\n"; \
		$(MAKE) dev-host-runner; \
	fi

dev-docker: ensure-docker-socket
	@$(ENV_LOADER) $(DEV_SECRETS) $(COMPOSE) $(DEV_COMPOSE_FILES) up --build

dev-support: ensure-docker-socket
	@$(ENV_LOADER) \
		$(DEV_SECRETS) $(COMPOSE) $(DEV_COMPOSE_FILES) stop runner >/dev/null 2>&1 || true; \
		COTS_API_BASE_URL="$${HOST_RUNNER_API_URL:-http://host.docker.internal:8080}" \
		$(DEV_SECRETS) $(COMPOSE) $(DEV_COMPOSE_FILES) up --build -d --force-recreate --no-deps ui

runner-dev: ensure-docker-socket ## Run the Go runner on the host against the detected Docker socket
	@$(ENV_LOADER) \
		mkdir -p ./runner-v2/data; \
		cd runner-v2 && \
		unset TESTCONTAINERS_HOST_OVERRIDE TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE RUNNER_DOCKER_HOST CONTAINER_DOCKER_SOCKET_PATH; \
		APP_ENV="$${RUNNER_APP_ENV:-$${APP_ENV:-development}}" \
		LOG_LEVEL="$${RUNNER_LOG_LEVEL:-$${LOG_LEVEL:-info}}" \
		PORT="$${RUNNER_PORT:-8080}" \
		CORS_ORIGIN="$${CORS_ORIGIN:-http://localhost:3000}" \
		DB_TYPE="$${RUNNER_DB_TYPE:-sqlite}" \
		DB_PATH="$${HOST_RUNNER_DB_PATH:-$$(pwd)/data/cots.db}" \
		DATABASE_URL="$${RUNNER_DATABASE_URL:-}" \
		DOCKER_HOST="unix://$${DOCKER_SOCKET_PATH:-/var/run/docker.sock}" \
		TESTCONTAINERS_RYUK_DISABLED=true \
		WORKFLOW_WORKER_ENABLED="$${WORKFLOW_WORKER_ENABLED:-true}" \
		WORKFLOW_JOB_ENCRYPTION_KEY="$${WORKFLOW_JOB_ENCRYPTION_KEY:-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=}" \
		go run ./cmd/main.go -migrate

dev-host-runner: dev-support ## Run the UI in Docker and the runner on the host
	@printf "UI: http://localhost:3000\n"
	@printf "Runner logs will stream below. Stop with Ctrl+C, then use 'make down' to stop docker Services.\n\n"
	@$(MAKE) runner-dev

ui-dev: ## Run the Next.js UI on the host against the local runner
	@$(ENV_LOADER) \
		cd ui-v2 && \
		COTS_API_BASE_URL="$${COTS_API_BASE_URL:-http://localhost:8080}" \
		DB_TYPE="$${UI_DB_TYPE:-sqlite}" \
		DB_PATH="$${UI_DB_PATH:-$$(pwd)/data/tokyo-tester-auth.db}" \
		DATABASE_URL="$${UI_DATABASE_URL:-}" \
		AUTH_SECRET="$${AUTH_SECRET:-local-dev-auth-secret}" \
		AUTH_TRUST_HOST="$${AUTH_TRUST_HOST:-true}" \
		bun run db:migrate && \
		COTS_API_BASE_URL="$${COTS_API_BASE_URL:-http://localhost:8080}" \
		DB_TYPE="$${UI_DB_TYPE:-sqlite}" \
		DB_PATH="$${UI_DB_PATH:-$$(pwd)/data/tokyo-tester-auth.db}" \
		DATABASE_URL="$${UI_DATABASE_URL:-}" \
		AUTH_SECRET="$${AUTH_SECRET:-local-dev-auth-secret}" \
		AUTH_TRUST_HOST="$${AUTH_TRUST_HOST:-true}" \
		bun run dev

dev-local: doctor ## Run both the UI and runner on the host for Docker socket or volume edge cases
	@$(ENV_LOADER) \
		printf "UI: http://localhost:3000\n"; \
		printf "Runner: http://localhost:8080\n"; \
		$(MAKE) ui-dev & \
		ui_pid=$$!; \
		trap 'kill $$ui_pid >/dev/null 2>&1 || true' INT TERM EXIT; \
		$(MAKE) runner-dev

agent-dev: ensure-docker-socket ## Expose the local MCP server on http://localhost:8090/mcp (run after make dev)
	@$(ENV_LOADER) $(DEV_SECRETS) $(COMPOSE) $(DEV_COMPOSE_FILES) --profile agent-dev up --build -d --no-deps mcp
	@printf "Tokyo Tester MCP: http://localhost:8090/mcp\n"
	@printf "Health check:      http://localhost:8090/health\n"

prod: ensure-docker-socket ## Run the local production-like stack
	@$(ENV_LOADER) $(COMPOSE) $(COMPOSE_FILES) --profile agent up --build -d

test: test-go test-ui test-test-api ## Run backend and frontend tests

test-go: ## Run all Go tests
	@cd runner-v2 && GOCACHE="$${GOCACHE:-/tmp/tokyo-tester-go-cache}" go test ./...

test-ui: ## Type-check and test the UI, including Node-based auth/database tests
	@cd ui-v2 && bunx next typegen && bunx tsc --noEmit
	@cd ui-v2 && bun test src/modules/workflow src/modules/sync
	@cd ui-v2 && node --import tsx --test src/modules/auth/server/service.test.ts src/modules/projects/server/service.integration.test.ts

test-test-api: ## Type-check and unit-test the reusable test application
	@cd test-api && bun run typecheck && bun test

test-api-build: ensure-docker-socket ## Build both compatible tags for the workflow fixture image
	@$(ENV_LOADER) docker build -t tokyo-test-api:latest -t bun-user-api:latest ./test-api

test-complex-e2e: test-api-build ## Run the opt-in, resource-heavy payment provider matrix
	@cd runner-v2 && RUN_COMPLEX_PAYMENT_E2E=1 GOCACHE="$${GOCACHE:-/tmp/tokyo-tester-go-cache}" go test -count=1 -timeout=60m ./e2e -run TestComplexPaymentFixturesE2E

compose-check: ## Validate production and development Compose files
	@AUTH_SECRET=compose-check-auth-secret WORKFLOW_JOB_ENCRYPTION_KEY="$${WORKFLOW_JOB_ENCRYPTION_KEY:-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=}" $(COMPOSE) $(COMPOSE_FILES) --profile agent config --quiet
	@AUTH_SECRET=compose-check-auth-secret WORKFLOW_JOB_ENCRYPTION_KEY="$${WORKFLOW_JOB_ENCRYPTION_KEY:-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=}" $(COMPOSE) $(DEV_COMPOSE_FILES) config --quiet

check: test compose-check ## Run tests and validate deployment configuration
	@cd runner-v2 && GOCACHE="$${GOCACHE:-/tmp/tokyo-tester-go-cache}" go vet ./...
	@cd ui-v2 && bunx biome check $(UI_RUNNER_CHECK_PATHS)

down: ## Stop the stack while preserving database volumes
	@$(ENV_LOADER) $(DEV_SECRETS) $(COMPOSE) $(DEV_COMPOSE_FILES) --profile agent --profile agent-dev down --remove-orphans

reset: ## Stop the dev stack and delete all local database volumes
	@$(ENV_LOADER) $(DEV_SECRETS) $(COMPOSE) $(DEV_COMPOSE_FILES) --profile agent --profile agent-dev down --volumes --remove-orphans
