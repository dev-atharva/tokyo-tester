#!/bin/bash
set -e

BUNDLE_FILE="$1"
API_URL="${2:-http://localhost:8080}"

if [ -z "$BUNDLE_FILE" ]; then
    echo "Usage: $0 <workflow-bundle.json> [API_URL]"
    echo ""
    echo "Examples:"
    echo "  $0 bundle.json"
    echo "  $0 bundle.json http://localhost:8080"
    exit 1
fi

if [ ! -f "$BUNDLE_FILE" ]; then
    echo "Error: Workflow bundle not found: $BUNDLE_FILE"
    exit 1
fi

echo "COTS WORKFLOW BUNDLE RUNNER"
echo ""

echo "Checking health of service"
if ! curl -s -f "$API_URL/health" > /dev/null; then
    echo "Error: API server is not reachable at $API_URL"
    exit 1
fi
echo "Service healthy"
echo ""

echo "Running workflow bundle"
RESPONSE=$(curl -s -X POST "$API_URL/workflow-bundles/run" \
    -H "Content-Type: application/json" \
    --data-binary "@$BUNDLE_FILE")

if echo "$RESPONSE" | jq -e '.error' > /dev/null 2>&1; then
    echo "Error running workflow bundle:"
    echo "$RESPONSE" | jq '.'
    exit 1
fi

echo "$RESPONSE" | jq '.'
echo ""

SUCCESS=$(echo "$RESPONSE" | jq -r '.success')
if [ "$SUCCESS" = "true" ]; then
    echo "Result: All scenarios passed"
    exit 0
fi

echo "Result: One or more scenarios failed"
exit 1
