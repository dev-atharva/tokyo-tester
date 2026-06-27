#!/bin/bash

set -e

RED='\033[0:31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}Detecting Docker socket...${NC}"

SOCKET_LOCATIONS=()
if [ -n "${DOCKER_SOCKET_PATH:-}" ]; then
    SOCKET_LOCATIONS+=("$DOCKER_SOCKET_PATH")
fi
SOCKET_LOCATIONS+=(
    "/var/run/docker.sock"
    "$HOME/.rd/docker.sock"
    "$HOME/.docker/run/docker.sock"
    "/run/docker.sock"
)

FOUND_SOCKET=""
CONTAINER_DOCKER_SOCKET_PATH="/var/run/docker.sock"

for socket in "${SOCKET_LOCATIONS[@]}"; do
    if [ -S "$socket" ]; then
        if docker -H "unix://$socket" info >/dev/null 2>&1; then
            echo -e "${GREEN} Found accessible socket: $socket${NC}"
            FOUND_SOCKET="$socket"
            break
        fi
        echo -e "${YELLOW} Socket is not accessible, trying another: $socket${NC}"
    fi
done

if [ -z "$FOUND_SOCKET" ]; then
    echo -e "${RED} Error: No accessible Docker socket found${NC}"
    echo ""
    echo "Please ensure Docker is installed and running"
    exit 1
fi

RUNNER_DOCKER_HOST="unix://$CONTAINER_DOCKER_SOCKET_PATH"
TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE="$CONTAINER_DOCKER_SOCKET_PATH"

detect_testcontainers_host_override() {
    case "$(uname -s)" in
        Darwin|MINGW*|MSYS*|CYGWIN*)
            echo "host.docker.internal"
            ;;
        Linux)
            local bridge_gateway
            bridge_gateway=$(docker -H "unix://${FOUND_SOCKET}" network inspect bridge --format '{{(index .IPAM.Config 0).Gateway}}' 2>/dev/null || true)
            if [ -n "$bridge_gateway" ] && [ "$bridge_gateway" != "<no value>" ]; then
                echo "$bridge_gateway"
                return
            fi

            local default_gateway
            default_gateway=$(ip route show default 2>/dev/null | awk '/default/ {print $3; exit}')
            if [ -n "$default_gateway" ]; then
                echo "$default_gateway"
                return
            fi

            echo "host.docker.internal"
            ;;
        *)
            echo "host.docker.internal"
            ;;
    esac
}
TESTCONTAINERS_HOST_OVERRIDE=$(detect_testcontainers_host_override)
echo -e "${GREEN} Docker socket is accessible ${NC}"
echo ""

if [ "$FOUND_SOCKET" != "/var/run/docker.sock" ]; then
    echo -e "${YELLOW} Non-standard Docker socket detected.${NC}"
    echo -e "${YELLOW} make dev will use host-runner mode so the Go runner talks to Docker from the host instead of from inside a container.${NC}"
    echo ""
fi

cat > .env.docker-socket << EOF
DOCKER_SOCKET_PATH=$FOUND_SOCKET
CONTAINER_DOCKER_SOCKET_PATH=$CONTAINER_DOCKER_SOCKET_PATH
RUNNER_DOCKER_HOST=$RUNNER_DOCKER_HOST
TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=$TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE
TESTCONTAINERS_HOST_OVERRIDE=$TESTCONTAINERS_HOST_OVERRIDE
EOF

echo -e "${GREEN} Saved to .env.docker-socket${NC}"
echo -e "${GREEN} RUNNER_DOCKER_HOST=$RUNNER_DOCKER_HOST${NC}"
echo -e "${GREEN} TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=$TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE${NC}"
echo -e "${GREEN} TESTCONTAINERS_HOST_OVERRIDE=$TESTCONTAINERS_HOST_OVERRIDE${NC}"
