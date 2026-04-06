.DEFAULT_GOAL := help

COMPOSE := docker compose
COMPOSE_FILES := -f docker-compose.yml
DEV_COMPOSE_FILES := -f docker-compose.yml -f docker-compose.dev.yml

.PHONY: help dev prod down

help: ## Show available commands
	@printf "Tokyo Tester commands\n\n"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  %-8s %s\n", $$1, $$2}'
	@printf "\nOptional env: DOCKER_SOCKET_PATH, RUNNER_DB_TYPE, RUNNER_DATABASE_URL, UI_DB_TYPE, UI_DATABASE_URL, AUTH_SECRET\n"

dev: ## Run the local development stack
	@$(COMPOSE) $(DEV_COMPOSE_FILES) up --build

prod: ## Run the local production-like stack
	@$(COMPOSE) $(COMPOSE_FILES) up --build -d

down: ## Stop the dev stack and remove volumes for a fresh restart
	@$(COMPOSE) $(DEV_COMPOSE_FILES) down --volumes --remove-orphans
