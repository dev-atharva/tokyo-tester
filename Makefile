.DEFAULT_GOAL := help

COMPOSE := docker compose
COMPOSE_FILES := -f docker-compose.yml
DEV_COMPOSE_FILES := -f docker-compose.yml -f docker-compose.dev.yml
SOCKET_ENV_FILE := .env.docker-socket
ENV_LOADER = set -a; \
	if [ -f ./$(SOCKET_ENV_FILE) ]; then . ./$(SOCKET_ENV_FILE); fi; \
	if [ -f ./.env ]; then . ./.env; fi; \
	set +a;

.PHONY: help ensure-docker-socket dev dev-docker dev-host-runner dev-support runner-dev prod down

help: ## Show available commands
	@printf "Tokyo Tester commands\n\n"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  %-8s %s\n", $$1, $$2}'
	@printf "\nOptional env: use .env for app overrides. Docker socket settings are auto-detected into $(SOCKET_ENV_FILE).\n"

ensure-docker-socket: ## Detect the Docker socket and write .env.docker-socket
	@bash ./scripts/detect-docker-socket.sh

dev: ensure-docker-socket ## Run the dev stack; auto-falls back to a host runner for non-standard Docker Sockets
	@$(ENV_LOADER) \
	if [ "$${DOCKER_SOCKET_PATH:-/var/run/docker.sock}" = "/var/run/docker.sock" ]; then \
		printf "Using fully dockerized dev stack.\n"; \
		$(MAKE) dev-docker; \
	else \
		printf "Detected non-standard Docker socket %s.\n" "$${DOCKER_SOCKET_PATH}"; \
		printf "Starting the UI/Inngest in docker and the runner on the host.\n"; \
		$(MAKE) dev-host-runner; \
	fi

dev-docker: ensure-docker-socket
	@$(ENV_LOADER) $(COMPOSE) $(DEV_COMPOSE_FILES) up --build

dev-support: ensure-docker-socket
	@$(ENV_LOADER) \
		$(COMPOSE) $(DEV_COMPOSE_FILES) stop runner >/dev/null 2>&1 || true; \
		COTS_API_BASE_URL="$${HOST_RUNNER_API_URL:-http://host.docker.internal:8080}" \
		$(COMPOSE) $(DEV_COMPOSE_FILES) up --build -d --force-recreate --no-deps ui inngest

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
		go run ./cmd/main.go -migrate

dev-host-runner: dev-support ## Run UI/Inngest in Docker and the runner on the host
	@printf "UI: http://localhost:3000\n"
	@printf "Inngest: http://localhost:8288\n"
	@printf "Runner logs will stream below. Stop with Ctrl+C, then use 'make down' to stop docker Services.\n\n"
	@$(MAKE) runner-dev

prod: ensure-docker-socket ## Run the local production-like stack
	@$(ENV_LOADER) $(COMPOSE) $(COMPOSE_FILES) up --build -d

down: ## Stop the dev stack and remove volumes for a fresh restart
	@$(ENV_LOADER) $(COMPOSE) $(DEV_COMPOSE_FILES) down --volumes --remove-orphans
