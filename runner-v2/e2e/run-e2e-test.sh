#!/bin/bash
set -e

# Usage: ./run-e2e-test.sh <test-file.json> [API_URL]
TEST_FILE="$1"
API_URL="${2:-http://localhost:8080}"

# -----------------------------
# Validate input
# -----------------------------
if [ -z "$TEST_FILE" ]; then
    echo "Usage: $0 <test-file.json> [API_URL]"
    echo ""
    echo "Examples:"
    echo "  $0 01-Simple-workflow.json"
    echo "  $0 01-Simple-workflow.json http://localhost:3000"
    exit 1
fi

if [ ! -f "$TEST_FILE" ]; then
    echo "Error: Test file not found: $TEST_FILE"
    exit 1
fi

echo "COTS TEST RUNNER"
echo ""

# -----------------------------
# Health check
# -----------------------------
echo "Checking health of service"
if ! curl -s -f "$API_URL/health" > /dev/null; then
    echo "Error: API server is not reachable at $API_URL"
    exit 1
fi
echo "Service healthy"
echo ""

# -----------------------------
# Create services
# -----------------------------
echo "Creating services"
SERVICES=$(jq '.services_request' "$TEST_FILE")
SERVICE_COUNT=$(echo "$SERVICES" | jq '.services | length')
echo "Services to create: $SERVICE_COUNT"

RESPONSE=$(echo "$SERVICES" | curl -s -X POST "$API_URL/services" \
    -H "Content-Type: application/json" \
    -d @-)

if echo "$RESPONSE" | jq -e '.error' > /dev/null 2>&1; then
    echo "Error creating resources:"
    echo "$RESPONSE" | jq '.'
    exit 1
fi

SESSION_ID=$(echo "$RESPONSE" | jq -r '.session_id')
echo "Session was created: $SESSION_ID"
echo ""

# -----------------------------
# Run tests
# -----------------------------
echo "Run tests"
TESTS=$(jq '.test_request' "$TEST_FILE")
TEST_COUNT=$(echo "$TESTS" | jq '.tests | length')
echo "Tests to run: $TEST_COUNT"
echo ""

TEST_RESPONSE=$(echo "$TESTS" | curl -s -X POST "$API_URL/tests/$SESSION_ID" \
    -H "Content-Type: application/json" \
    -d @-)

if echo "$TEST_RESPONSE" | jq -e '.error' > /dev/null 2>&1; then
    echo "Error running tests"
    echo "$TEST_RESPONSE" | jq '.'
    echo ""
    echo "Cleaning up session ..."
    curl -s -X DELETE "$API_URL/cleanup/$SESSION_ID" > /dev/null
    exit 1
fi

echo "Test results"
echo "$TEST_RESPONSE" | jq '.'
echo ""

# -----------------------------
# Summary
# -----------------------------
PASSED=$(echo "$TEST_RESPONSE" | jq -r '.summary.passed // 0')
FAILED=$(echo "$TEST_RESPONSE" | jq -r '.summary.failed // 0')
TOTAL=$(echo "$TEST_RESPONSE" | jq -r '.summary.total // 0')

echo "Summary"
echo "Total tests : $TOTAL"
echo "Passed      : $PASSED"
if [ "${FAILED:-0}" -gt 0 ]; then
    echo "Failed      : $FAILED"
fi
echo ""

# -----------------------------
# Cleanup
# -----------------------------
echo "Clean up"
CLEANUP_RESPONSE=$(curl -s -X DELETE "$API_URL/cleanup/$SESSION_ID")

if echo "$CLEANUP_RESPONSE" | jq -e '.error' > /dev/null 2>&1; then
    echo "Warning: Cleanup failed"
    echo "$CLEANUP_RESPONSE" | jq '.'
else
    echo "Session cleaned up"
fi
echo ""

# -----------------------------
# Final result
# -----------------------------
echo "------------------"
if [ "${FAILED:-0}" -gt 0 ]; then
    echo "Result: Tests Failed"
    echo "--------------------"
    exit 1
else
    echo "Result: All tests passed"
    echo "---------------------"
    exit 0
fi
