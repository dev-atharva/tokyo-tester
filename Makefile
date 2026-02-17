.PHONY help build build-runner build-ui up up-dev up-postgres down \
		clean logs health validate-docker check-socket check-version migrate

DOCKER_MIN_VERSION=20.10.0
COMPOSE_FILE=docker-compose.yml
COMPOSE_DEV_FILE=docker-compose.dev.yml

help:
	@echo "Tokyo tester - Container Orchestration Test System"
	@echo ""
	@echo "Available commands"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' ${MAKEFILE_LIST} | \
	    awk 'BEGIN {FS = ":.*?## "}; {printf " %-16s$ %s\n", $$1, $$2}'

validate-docker: check-version check-socket

check-version:
	@echo "Checking the docker version"
	@command -v docker >/dev/null 2>&1 || { \
		echo "Error: Docker is not installed"; \
		exit 1;
	}
	@DOCKER_VERSION=$$(docker version --format '{{.Server.Version}}' 2>/dev/null); \
	if [ -z "$$DOCKER_VERSION" ]; then \
		echo "Error: Docker daemon is not running"; \
		exit 1; \
	fi; \
	echo "Docker VersionL $$DOCKER_VERSION"

check-socket:
	@echo "Detecting the docker socket"
	@SOCKET_PATH=""; \
	if [ -S "/var/run/docker.sock" ]; then \
		SOCKET_PATH="/var/run/docker.sock"; \
	elif [ -S "$$HOME/.rd/docker.sock" ]; then \
		SOCKET_PATH="$$HOME/.rd/docker.sock"; \
	elif [ -S "$$HOME/.docker/run/docker.sock" ]; then \
		SOCKET_PATH="$$HOME/.docker/run/docker.sock"; \
	fi; \
	if [ -z "$$SOCKET_PATH" ]; then \
		echo "Error: Could not find the docker socket"; \
		exit 1; \
	fi;
	echo "DOCKER_SOCKET_PATH=$$SOCKET_PATH" > .env.docker-socket; \
	echo "DOCKER_HOST=unix://$$SOCKET_PATH" >> .env.docker-socket

build: validate-docker
	@echo "Building the services"
	@. ./.env.docker-socket 2>/dev/null || make check-socket
	docker compose -f ${COMPOSE_FILE} build

build-runner: validate-docker
	@echo "Building the runner..."
	docker compose -f ${COMPOSE_FILE} build runner

build-ui: validate-docker
	@echo "Building ui..."
	docker compose -f ${COMPOSE_FILE} build ui

up: validate-docker
	@echo "Starting the services..."
	@. ./.env.docker-socket 2>/dev/null || make check-socket
	@. ./env.docker-socket && docker-compose -f ${COMPOSE_FILE} up -d
	@echo ""
	@echo "Started services"
	@echo " Frontend: http://localhost:3000"
	@echo " Backend: http://localhost:8080"
	@echo " Inngest: http://localhost:8288"
	@echo ""
	@echo "Run 'make logs' to view logs"
	@echo "Run 'make health' to check service health"

up-postgres: validate-docker
	@echo "Starting services with PostgresSQL..."
	@. ./.env.docker-socket 2>/dev/null || make check-socket
	@. ./.env.docker-socket && docker compose -f ${COMPOSE_FILE} --profile postgres up -d
	@echo "Services started with postgres db"

up-dev: validate-docker
	@echo "Starting the services in development mode..."
	@. ./.env.docker-socket 2>/dev/null || make check-socket
	@. ./.env.docker-socket && docker compose -f ${COMPOSE_FILE} -f ${COMPOSE_DEV_FILE} up
	@echo ""
	@echo "Development mode started"

down:
	@echo "Stopping services..."
	docker compose -f ${COMPOSE_FILE} -f ${COMPOSE_DEV_FILE} --profile postgres down

restart: down up

logs:
	docker compose -f ${COMPOSE_FILE} logs -f ${ARGS}

migrate:
	@echo "Running migrations..."
	docker compose -f ${COMPOSE_FILE} exec runner-v2 /app/cots -migrate

health:
	@echo "Checkign service health..."
	@echo ""
	@printf "Runner: "
	@curl -s http://localhost:8080/health 2>/dev/null && echo "Healthy" || echo "Unhealthy"
	@printf "UI: "
	@curl -s http://localhost:3000/api/health 2>/dev/null && echo "Healthy" || echo "Unhealthy"
	@printf "Inngest: "
	@curl -s http://localhost:8288/health 2>/dev/null && echo "Healthy" || echo "Unhealthy"
