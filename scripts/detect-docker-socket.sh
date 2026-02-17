#!/bin/bash

set -e

RED='\033[0:31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}Detecting Docker socket...${NC}"

SOCKET_LOCATIONS=(
    "/var/run/docker.sock"
    "$HOME/.rd/docker.sock"
    "$HOME/.docker/run/docker.sock"
    "/run/docker.sock"
)

FOUND_SOCKET=""

for socket in "${SOCKET_LOCATIONS[@]}"; do
    if [ -S "$socket" ]; then
        echo -e "${GREEN} Found: $socket${NC}"
        FOUND_SOCKET="$socket"
        break
    fi
done

if [ -z "$FOUND_SOCKET" ]; then
    echo -e "${RED} Error: No Docker socket found${NC}"
    echo ""
    echo "Please ensure Docker is installed and running"
    exit 1
fi

if ! docker -H "unix://$FOUND_SOCKET" info >/dev/null 2>&1; then
    echo -e "${RED} Error: Docker socket is not accessible${NC}"
    echo ""
    echo "Socket found but docker cannot communicate through it."
    exit 1
fi

DOCKER_HOST="unix://$FOUND_SOCKET"

echo "${GREEN} Docker socket is accessible${NC}"
echo ""

cat > .env.docker-socket << EOF
DOCKER_SOCKET_PATH=$FOUND_SOCKET
DOCKER_HOST=$DOCKER_HOST
EOF

echo -e "${GREEN} Saved to .env.docker-socket${NC}"
