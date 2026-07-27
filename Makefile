.DEFAULT_GOAL := help

COMPOSE := docker compose
COMPOSE_FILES := -f docker-compose.yml
PROD_PROFILES := --profile agent --profile observability
DEV_COMPOSE_FILES := -f docker-compose.yml -f docker-compose.dev.yml
TEST_COMPOSE_FILES := --project-name tokyo-tester-tests -f docker-compose.test.yml
SOCKET_ENV_FILE := .env.docker-socket
DEV_SECRETS = AUTH_SECRET="$${AUTH_SECRET:-local-dev-auth-secret}" MCP_INTERNAL_SECRET="$${MCP_INTERNAL_SECRET:-local-dev-mcp-internal-secret-32-bytes}" WORKFLOW_JOB_ENCRYPTION_KEY="$${WORKFLOW_JOB_ENCRYPTION_KEY:-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=}" MYSQL_ROOT_PASSWORD="$${MYSQL_ROOT_PASSWORD:-tokyo-dev-root-password}" MYSQL_PASSWORD="$${MYSQL_PASSWORD:-tokyo-dev-password}"
UI_RUNNER_CHECK_PATHS := proxy.ts package.json src/app/layout.tsx src/app/globals.css src/app/api/v1/workflow-runs src/modules/sync/sync-hydration.tsx src/modules/workflow/hooks/useRealtimeLogs.tsx src/modules/workflow/hooks/useWorkflowExecution.tsx src/modules/workflow/lib src/modules/workflow/server src/modules/workflow/stores/execution.store.sync.ts src/modules/workflow/types/workflow-run-input.contract.test.ts
ENV_LOADER = set -a; \
	if [ -f ./$(SOCKET_ENV_FILE) ]; then . ./$(SOCKET_ENV_FILE); fi; \
	if [ -f ./.env ]; then . ./.env; fi; \
	set +a;

.PHONY: help package-skill ensure-docker-socket doctor dev dev-docker dev-mysql dev-host-runner dev-local dev-support runner-dev ui-dev agent-dev prod prod-check prod-observe-user prod-observe prod-verify prod-backup prod-capture e2e e2e-install e2e-docker e2e-docker-leak down reset test test-mysql-up test-mysql-down test-go test-ui test-test-api test-api-build test-complex-e2e test-soak check compose-check

package-skill: ## Package the installable Tokyo Tester skill for local UI downloads
	@bash ./scripts/package-skill.sh

help: ## Show available commands
	@printf "Tokyo Tester commands\n\n"
	@grep -E '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  %-8s %s\n", $$1, $$2}'
	@printf "\nOptional env: use .env for app overrides. Production requires external MySQL URLs; development and tests use isolated local MySQL containers. Docker socket settings are auto-detected into $(SOCKET_ENV_FILE).\n"

ensure-docker-socket: ## Detect the Docker socket and write .env.docker-socket
	@bash ./scripts/detect-docker-socket.sh

doctor: ensure-docker-socket ## Check Docker, Compose, host tools, configuration, and development ports
	@bash ./scripts/dev-doctor.sh

dev: package-skill doctor ## Run the dev stack; auto-falls back to a host runner for non-standard Docker Sockets
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

dev-mysql: ensure-docker-socket ## Start the development MySQL server and wait for readiness
	@$(ENV_LOADER) $(DEV_SECRETS) $(COMPOSE) $(DEV_COMPOSE_FILES) up -d --wait mysql

dev-support: ensure-docker-socket
	@$(ENV_LOADER) \
		$(DEV_SECRETS) $(COMPOSE) $(DEV_COMPOSE_FILES) stop runner >/dev/null 2>&1 || true; \
		$(DEV_SECRETS) $(COMPOSE) $(DEV_COMPOSE_FILES) up -d --wait mysql; \
		COTS_API_BASE_URL="$${HOST_RUNNER_API_URL:-http://host.docker.internal:8080}" \
		$(DEV_SECRETS) $(COMPOSE) $(DEV_COMPOSE_FILES) up --build -d --force-recreate --no-deps ui

runner-dev: dev-mysql ## Run the Go runner on the host against the detected Docker socket
	@$(ENV_LOADER) \
		cd runner-v2 && \
		unset TESTCONTAINERS_HOST_OVERRIDE TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE RUNNER_DOCKER_HOST CONTAINER_DOCKER_SOCKET_PATH; \
		APP_ENV="$${RUNNER_APP_ENV:-$${APP_ENV:-development}}" \
		LOG_LEVEL="$${RUNNER_LOG_LEVEL:-$${LOG_LEVEL:-info}}" \
		PORT="$${RUNNER_PORT:-8080}" \
		CORS_ORIGIN="$${CORS_ORIGIN:-http://localhost:3000}" \
		DB_TYPE="$${RUNNER_DB_TYPE:-mysql}" \
		DATABASE_URL="$${RUNNER_DATABASE_URL:-tokyo:$${MYSQL_PASSWORD:-tokyo-dev-password}@tcp(127.0.0.1:$${MYSQL_PORT:-3306})/tokyo_runner}" \
		DOCKER_HOST="unix://$${DOCKER_SOCKET_PATH:-/var/run/docker.sock}" \
		TESTCONTAINERS_RYUK_DISABLED=true \
		WORKFLOW_WORKER_ENABLED="$${WORKFLOW_WORKER_ENABLED:-true}" \
		WORKFLOW_JOB_ENCRYPTION_KEY="$${WORKFLOW_JOB_ENCRYPTION_KEY:-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=}" \
		go run ./cmd/main.go -migrate

dev-host-runner: dev-support ## Run the UI in Docker and the runner on the host
	@printf "UI: http://localhost:3000\n"
	@printf "Runner logs will stream below. Stop with Ctrl+C, then use 'make down' to stop docker Services.\n\n"
	@$(MAKE) runner-dev

ui-dev: package-skill dev-mysql ## Run the Next.js UI on the host against the local runner
	@$(ENV_LOADER) \
		cd ui-v2 && \
		COTS_API_BASE_URL="$${COTS_API_BASE_URL:-http://localhost:8080}" \
		DB_TYPE="$${UI_DB_TYPE:-mysql}" \
		DATABASE_URL="$${UI_DATABASE_URL:-mysql://tokyo:$${MYSQL_PASSWORD:-tokyo-dev-password}@127.0.0.1:$${MYSQL_PORT:-3306}/tokyo_ui}" \
		AUTH_SECRET="$${AUTH_SECRET:-local-dev-auth-secret}" \
		AUTH_TRUST_HOST="$${AUTH_TRUST_HOST:-true}" \
		MCP_INTERNAL_SECRET="$${MCP_INTERNAL_SECRET:-local-dev-mcp-internal-secret-32-bytes}" \
		MCP_AUTH_MODE="$${MCP_AUTH_MODE:-personal_token}" \
		MCP_PUBLIC_URL="$${MCP_PUBLIC_URL:-http://localhost:8090/mcp}" \
		bun run db:migrate && \
		COTS_API_BASE_URL="$${COTS_API_BASE_URL:-http://localhost:8080}" \
		DB_TYPE="$${UI_DB_TYPE:-mysql}" \
		DATABASE_URL="$${UI_DATABASE_URL:-mysql://tokyo:$${MYSQL_PASSWORD:-tokyo-dev-password}@127.0.0.1:$${MYSQL_PORT:-3306}/tokyo_ui}" \
		AUTH_SECRET="$${AUTH_SECRET:-local-dev-auth-secret}" \
		AUTH_TRUST_HOST="$${AUTH_TRUST_HOST:-true}" \
		MCP_INTERNAL_SECRET="$${MCP_INTERNAL_SECRET:-local-dev-mcp-internal-secret-32-bytes}" \
		MCP_AUTH_MODE="$${MCP_AUTH_MODE:-personal_token}" \
		MCP_PUBLIC_URL="$${MCP_PUBLIC_URL:-http://localhost:8090/mcp}" \
		bun run dev

dev-local: doctor dev-mysql ## Run both the UI and runner on the host for Docker socket or volume edge cases
	@$(ENV_LOADER) \
		printf "UI: http://localhost:3000\n"; \
		printf "Runner: http://localhost:8080\n"; \
		$(MAKE) --assume-old=dev-mysql ui-dev & \
		ui_pid=$$!; \
		trap 'kill $$ui_pid >/dev/null 2>&1 || true' INT TERM EXIT; \
		$(MAKE) --assume-old=dev-mysql runner-dev

agent-dev: ensure-docker-socket ## Expose the local MCP server on http://localhost:8090/mcp (run after make dev)
	@$(ENV_LOADER) $(DEV_SECRETS) $(COMPOSE) $(DEV_COMPOSE_FILES) --profile agent-dev up --build -d --no-deps mcp
	@printf "Tokyo Tester MCP: http://localhost:8090/mcp\n"
	@printf "Health check:      http://localhost:8090/health\n"

prod-check: ensure-docker-socket ## Validate the dedicated Docker production host
	@$(ENV_LOADER) bash ./scripts/prod-check.sh

prod: prod-check ## Build, migrate, and start the supported production stack
	@$(ENV_LOADER) $(COMPOSE) $(COMPOSE_FILES) $(PROD_PROFILES) up --build -d --wait --wait-timeout "$${PROD_WAIT_TIMEOUT:-180}"

prod-observe-user: ## Create or replace the authenticated log-viewer administrator
	@$(ENV_LOADER) bash ./scripts/prod-observe-user.sh

prod-observe: ## Show the authenticated production log-viewer URL
	@$(ENV_LOADER) printf "Authenticated log UI: %s/logs/\n" "$${TOKYO_TESTER_PUBLIC_ORIGIN%/}"

prod-verify: ## Verify production health, execute a Docker smoke workflow, and check for leaks
	@$(ENV_LOADER) bash ./scripts/prod-verify.sh

prod-backup: ## Back up both external MySQL databases with checksums
	@$(ENV_LOADER) bash ./scripts/prod-backup.sh

prod-capture: ## Capture a redacted deployment baseline before reconciling server-only changes
	@$(ENV_LOADER) bash ./scripts/capture-production-baseline.sh

test: test-go test-ui test-test-api ## Run backend and frontend tests

test-mysql-up: ensure-docker-socket ## Start the isolated MySQL server used by database tests
	@$(COMPOSE) $(TEST_COMPOSE_FILES) up -d --wait mysql-test
	@$(COMPOSE) $(TEST_COMPOSE_FILES) exec -T mysql-test sh -c 'MYSQL_PWD="$$MYSQL_ROOT_PASSWORD" mysql --user=root --execute="CREATE DATABASE IF NOT EXISTS ui_auth_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci; CREATE DATABASE IF NOT EXISTS ui_projects_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci; CREATE DATABASE IF NOT EXISTS ui_integration_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;"'

test-mysql-down: ## Stop the isolated MySQL test server
	@$(COMPOSE) $(TEST_COMPOSE_FILES) down --volumes --remove-orphans

test-go: test-mysql-up ## Run all Go tests against MySQL
	@cd runner-v2 && MYSQL_TEST_ADMIN_DSN="$${MYSQL_TEST_ADMIN_DSN:-root:tokyo-test-root-password@tcp(127.0.0.1:$${MYSQL_TEST_PORT:-33306})/mysql}" GOCACHE="$${GOCACHE:-/tmp/tokyo-tester-go-cache}" go test ./...

test-ui: test-mysql-up ## Type-check and test the UI against MySQL
	@cd ui-v2 && bun install --frozen-lockfile
	@cd ui-v2 && bunx next typegen && bunx tsc --noEmit
	@cd ui-v2 && bun test src/db/env.test.ts src/modules/workflow src/modules/sync
	@cd ui-v2 && UI_AUTH_TEST_DATABASE_URL="$${UI_AUTH_TEST_DATABASE_URL:-mysql://root:tokyo-test-root-password@127.0.0.1:$${MYSQL_TEST_PORT:-33306}/ui_auth_test}" UI_PROJECTS_TEST_DATABASE_URL="$${UI_PROJECTS_TEST_DATABASE_URL:-mysql://root:tokyo-test-root-password@127.0.0.1:$${MYSQL_TEST_PORT:-33306}/ui_projects_test}" UI_MYSQL_TEST_DATABASE_URL="$${UI_MYSQL_TEST_DATABASE_URL:-mysql://root:tokyo-test-root-password@127.0.0.1:$${MYSQL_TEST_PORT:-33306}/ui_integration_test}" node --import tsx --test --test-concurrency=1 src/db/mysql.integration.test.ts src/modules/auth/server/service.test.ts src/modules/projects/server/service.integration.test.ts

test-test-api: ## Type-check and unit-test the reusable test application
	@cd test-api && bun run typecheck && bun test

test-api-build: ensure-docker-socket ## Build both compatible tags for the workflow fixture image
	@$(ENV_LOADER) docker build -t tokyo-test-api:latest -t bun-user-api:latest ./test-api

test-complex-e2e: test-api-build ## Run the opt-in, resource-heavy payment provider matrix
	@cd runner-v2 && RUN_COMPLEX_PAYMENT_E2E=1 GOCACHE="$${GOCACHE:-/tmp/tokyo-tester-go-cache}" go test -count=1 -timeout=60m ./e2e -run TestComplexPaymentFixturesE2E

test-soak: test-mysql-up ## Exercise renewable leases for TOKYO_SOAK_DURATION (default 10m; use 24h before beta)
	@cd runner-v2 && MYSQL_TEST_ADMIN_DSN="$${MYSQL_TEST_ADMIN_DSN:-root:tokyo-test-root-password@tcp(127.0.0.1:$${MYSQL_TEST_PORT:-33306})/mysql}" TOKYO_SOAK_DURATION="$${TOKYO_SOAK_DURATION:-10m}" GOCACHE="$${GOCACHE:-/tmp/tokyo-tester-go-cache}" go test -tags=soak -count=1 -timeout="$${TOKYO_SOAK_TIMEOUT:-25h}" ./pkg/api -run TestLongRunningSessionLeaseSoak

e2e-install: ## Install the pinned Playwright harness and Chromium
	@cd e2e && bun install --frozen-lockfile && bunx playwright install chromium

e2e: e2e-docker ## Run the supported whole-product Docker journey

e2e-docker: ensure-docker-socket ## Run the guided Docker production-image journey
	@$(ENV_LOADER) cd e2e && bun run test:docker

e2e-docker-leak: ensure-docker-socket ## Repeat the Docker cleanup journey 20 times and assert cleanup after every run
	@$(ENV_LOADER) cd e2e && \
		E2E_REPEAT_EACH=20 \
		E2E_WORKFLOW_SUBMISSIONS_PER_MINUTE_USER=100 \
		bun run test:docker --grep "guided application and Redis workflow executes"

compose-check: ## Validate production, development, and test Compose files
	@AUTH_SECRET=compose-check-auth-secret RUNNER_DATABASE_URL=mysql://tokyo:password@db.example.internal:3306/tokyo_runner UI_DATABASE_URL=mysql://tokyo:password@db.example.internal:3306/tokyo_ui WORKFLOW_JOB_ENCRYPTION_KEY="$${WORKFLOW_JOB_ENCRYPTION_KEY:-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=}" $(COMPOSE) $(COMPOSE_FILES) $(PROD_PROFILES) config --quiet
	@AUTH_SECRET=compose-check-auth-secret MYSQL_ROOT_PASSWORD=compose-check-root-password MYSQL_PASSWORD=compose-check-app-password WORKFLOW_JOB_ENCRYPTION_KEY="$${WORKFLOW_JOB_ENCRYPTION_KEY:-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=}" $(COMPOSE) $(DEV_COMPOSE_FILES) config --quiet
	@$(COMPOSE) $(TEST_COMPOSE_FILES) config --quiet

check: test compose-check ## Run tests and validate deployment configuration
	@cd runner-v2 && GOCACHE="$${GOCACHE:-/tmp/tokyo-tester-go-cache}" go vet ./...
	@cd ui-v2 && bunx biome check $(UI_RUNNER_CHECK_PATHS)

down: ## Stop the stack while preserving database volumes
	@$(ENV_LOADER) $(DEV_SECRETS) $(COMPOSE) $(DEV_COMPOSE_FILES) --profile agent --profile agent-dev --profile observability down --remove-orphans

reset: ## Stop the dev stack and delete all local database volumes
	@$(ENV_LOADER) $(DEV_SECRETS) $(COMPOSE) $(DEV_COMPOSE_FILES) --profile agent --profile agent-dev --profile observability down --volumes --remove-orphans
