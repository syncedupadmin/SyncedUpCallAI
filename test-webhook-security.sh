#!/bin/bash

# Test script for Phase 2: Webhook Token Authentication
# Tests all 3 webhook endpoints with various authentication scenarios

BASE_URL="http://localhost:3000"
RESULTS_FILE="webhook-test-results.txt"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🧪 PHASE 2: Webhook Security Testing" > $RESULTS_FILE
echo "====================================" >> $RESULTS_FILE
echo "" >> $RESULTS_FILE

test_count=0
pass_count=0
fail_count=0

# Function to run a test
run_test() {
  local test_name="$1"
  local endpoint="$2"
  local header_name="$3"
  local header_value="$4"
  local payload="$5"
  local expected_status="$6"

  test_count=$((test_count + 1))

  echo -e "\n${YELLOW}Test $test_count: $test_name${NC}"
  echo "Test $test_count: $test_name" >> $RESULTS_FILE
  echo "Endpoint: $endpoint" >> $RESULTS_FILE

  # Make the request
  if [ -n "$header_name" ] && [ -n "$header_value" ]; then
    response=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL$endpoint" \
      -H "Content-Type: application/json" \
      -H "$header_name: $header_value" \
      -d "$payload")
  else
    response=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL$endpoint" \
      -H "Content-Type: application/json" \
      -d "$payload")
  fi

  # Extract status code (last line)
  status=$(echo "$response" | tail -n1)
  body=$(echo "$response" | sed '$d')

  # Check result
  if [ "$status" = "$expected_status" ]; then
    echo -e "${GREEN}✅ PASS${NC} - Status: $status"
    echo "✅ PASS - Status: $status" >> $RESULTS_FILE
    pass_count=$((pass_count + 1))
  else
    echo -e "${RED}❌ FAIL${NC} - Expected: $expected_status, Got: $status"
    echo "❌ FAIL - Expected: $expected_status, Got: $status" >> $RESULTS_FILE
    fail_count=$((fail_count + 1))
  fi

  echo "Response: $body" >> $RESULTS_FILE
  echo "" >> $RESULTS_FILE
}

# Test payloads
CALL_PAYLOAD='{
  "call_id": "test-call-123",
  "lead_id": "test-lead-456",
  "agent_name": "Test Agent",
  "phone_number": "555-0100",
  "disposition": "Completed",
  "duration": 120,
  "campaign": "Test Campaign"
}'

CONTACT_PAYLOAD='{
  "lead_id": "test-lead-789",
  "phone_number": "555-0200",
  "first_name": "John",
  "last_name": "Doe",
  "email": "john@example.com"
}'

LEAD_PAYLOAD='{
  "lead_id": "test-lead-999",
  "phone_number": "555-0300",
  "first_name": "Jane",
  "last_name": "Smith",
  "email": "jane@example.com"
}'

echo "=========================================="
echo "🧪 PHASE 2: Webhook Security Testing"
echo "=========================================="
echo ""

# Get test token from environment or use placeholder
if [ -z "$TEST_WEBHOOK_TOKEN" ]; then
  echo -e "${RED}⚠️  WARNING: TEST_WEBHOOK_TOKEN not set${NC}"
  echo "To test with valid token, run: export TEST_WEBHOOK_TOKEN=agt_your_token_here"
  echo ""
  USE_TOKEN=""
else
  USE_TOKEN="$TEST_WEBHOOK_TOKEN"
  echo -e "${GREEN}✓ Using token: ${USE_TOKEN:0:12}...${NC}"
  echo ""
fi

# Test 1: Call webhook without any authentication
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Group 1: Testing /api/webhooks/convoso-calls"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
run_test \
  "Call webhook - No auth (should fail)" \
  "/api/webhooks/convoso-calls" \
  "" \
  "" \
  "$CALL_PAYLOAD" \
  "401"

# Test 2: Call webhook with invalid token
run_test \
  "Call webhook - Invalid token (should fail)" \
  "/api/webhooks/convoso-calls" \
  "X-Agency-Token" \
  "agt_invalid_token_12345" \
  "$CALL_PAYLOAD" \
  "401"

# Test 3: Call webhook with valid token (if available)
if [ -n "$USE_TOKEN" ]; then
  run_test \
    "Call webhook - Valid token (should succeed)" \
    "/api/webhooks/convoso-calls" \
    "X-Agency-Token" \
    "$USE_TOKEN" \
    "$CALL_PAYLOAD" \
    "200"
else
  echo -e "${YELLOW}⊘ Skipping valid token test (no token provided)${NC}"
  echo "⊘ Skipped - no token provided" >> $RESULTS_FILE
fi

# Test 4: Call webhook with legacy secret (if configured)
if [ -n "$CONVOSO_WEBHOOK_SECRET" ]; then
  run_test \
    "Call webhook - Legacy secret (backward compat)" \
    "/api/webhooks/convoso-calls" \
    "X-Webhook-Secret" \
    "$CONVOSO_WEBHOOK_SECRET" \
    "$CALL_PAYLOAD" \
    "200"
fi

# Test 5-7: Contact webhook tests
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Group 2: Testing /api/webhooks/convoso"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
run_test \
  "Contact webhook - No auth (should fail)" \
  "/api/webhooks/convoso" \
  "" \
  "" \
  "$CONTACT_PAYLOAD" \
  "401"

run_test \
  "Contact webhook - Invalid token (should fail)" \
  "/api/webhooks/convoso" \
  "X-Agency-Token" \
  "agt_invalid_token_67890" \
  "$CONTACT_PAYLOAD" \
  "401"

if [ -n "$USE_TOKEN" ]; then
  run_test \
    "Contact webhook - Valid token (should succeed)" \
    "/api/webhooks/convoso" \
    "X-Agency-Token" \
    "$USE_TOKEN" \
    "$CONTACT_PAYLOAD" \
    "200"
else
  echo -e "${YELLOW}⊘ Skipping valid token test (no token provided)${NC}"
  echo "⊘ Skipped - no token provided" >> $RESULTS_FILE
fi

# Test 8-10: Lead webhook tests
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Group 3: Testing /api/webhooks/convoso-leads"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
run_test \
  "Lead webhook - No auth (should fail)" \
  "/api/webhooks/convoso-leads" \
  "" \
  "" \
  "$LEAD_PAYLOAD" \
  "401"

run_test \
  "Lead webhook - Invalid token (should fail)" \
  "/api/webhooks/convoso-leads" \
  "X-Agency-Token" \
  "agt_invalid_token_11111" \
  "$LEAD_PAYLOAD" \
  "401"

if [ -n "$USE_TOKEN" ]; then
  run_test \
    "Lead webhook - Valid token (should succeed)" \
    "/api/webhooks/convoso-leads" \
    "X-Agency-Token" \
    "$USE_TOKEN" \
    "$LEAD_PAYLOAD" \
    "200"
else
  echo -e "${YELLOW}⊘ Skipping valid token test (no token provided)${NC}"
  echo "⊘ Skipped - no token provided" >> $RESULTS_FILE
fi

# Summary
echo ""
echo "=========================================="
echo "📊 Test Results Summary"
echo "=========================================="
echo "Total Tests: $test_count"
echo -e "${GREEN}Passed: $pass_count${NC}"
echo -e "${RED}Failed: $fail_count${NC}"
echo ""

echo "=========================================" >> $RESULTS_FILE
echo "📊 Test Results Summary" >> $RESULTS_FILE
echo "=========================================" >> $RESULTS_FILE
echo "Total Tests: $test_count" >> $RESULTS_FILE
echo "Passed: $pass_count" >> $RESULTS_FILE
echo "Failed: $fail_count" >> $RESULTS_FILE

if [ $fail_count -eq 0 ]; then
  echo -e "${GREEN}✅ All tests passed!${NC}"
  echo "✅ All tests passed!" >> $RESULTS_FILE
  exit 0
else
  echo -e "${RED}❌ Some tests failed. Check $RESULTS_FILE for details.${NC}"
  echo "❌ Some tests failed." >> $RESULTS_FILE
  exit 1
fi