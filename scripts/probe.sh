#!/bin/bash
# Convoso Integration Test Probe

# Set webhook secret (change as needed)
WEBHOOK_SECRET="${WEBHOOK_SECRET:-test-secret}"
BASE_URL="${BASE_URL:-http://localhost:3003}"

echo "🔍 Convoso Integration Test Probe"
echo "================================="
echo "Base URL: $BASE_URL"
echo ""

# Test 1: Lead webhook (no call fields)
echo "📧 Test 1: Lead webhook..."
curl -s -X POST "$BASE_URL/api/webhooks/convoso" \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: $WEBHOOK_SECRET" \
  -d '{"lead_id":"L123","first_name":"Cesar","last_name":"Tiscareno","phone_number":"+19545551234","email":"c@x.com","address":"123 A St","city":"Miami","state":"FL","list_id":"99"}' \
  | jq '.' || echo "Failed"

echo ""

# Test 2: Call webhook (has call fields)
echo "📞 Test 2: Call webhook..."
curl -s -X POST "$BASE_URL/api/webhooks/convoso-calls" \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: $WEBHOOK_SECRET" \
  -d '{"call_id":"C777","lead_id":"L123","agent_name":"Morgan Tate","disposition":"SALE","duration":487,"campaign":"U65-Q4","recording_url":""}' \
  | jq '.' || echo "Failed"

echo ""

# Test 3: Cron fetcher
echo "⏰ Test 3: Cron fetcher..."
curl -s "$BASE_URL/api/cron/process-recordings-v2" | jq '.' || echo "Failed"

echo ""

# Test 4: Status check
echo "📊 Test 4: Status check..."
curl -s "$BASE_URL/api/webhooks/status" | jq '.' || echo "Failed"

echo ""
echo "✅ Tests complete!"