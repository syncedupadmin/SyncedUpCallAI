#!/bin/bash

echo "=== Webhook Debug Test ==="
echo ""

# Test 1: Check health
echo "1. Health Check:"
HEALTH=$(curl -s "https://synced-up-call-ai.vercel.app/api/health")
echo "$HEALTH" | python -m json.tool 2>/dev/null || echo "$HEALTH"
echo ""

# Test 2: Test with wrong secret (should get 401)
echo "2. Testing with wrong secret (expect 401):"
curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" -X POST "https://synced-up-call-ai.vercel.app/api/hooks/convoso" \
  -H "x-webhook-secret: wrong-secret" \
  -H "Content-Type: application/json" \
  -d '{"lead_id": "test", "customer_phone": "+15551234567"}'
echo ""

# Test 3: Test with correct secret
echo "3. Testing with correct secret:"
RESPONSE=$(curl -s -w "\nHTTP Status: %{http_code}" -X POST "https://synced-up-call-ai.vercel.app/api/hooks/convoso" \
  -H "x-webhook-secret: 8nf3i9mmzoxidg3ntm28gbxvlhdiqo3p" \
  -H "x-agency-id: test-agency" \
  -H "Content-Type: application/json" \
  -d '{
    "lead_id": "debug-'$(date +%s)'",
    "customer_phone": "+15558675309",
    "agent_id": "agent-42",
    "agent_name": "Test Agent",
    "disposition": "Completed",
    "campaign": "ACA-Q4",
    "direction": "outbound",
    "started_at": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'",
    "ended_at": "'$(date -u -d "+35 seconds" +"%Y-%m-%dT%H:%M:%SZ")'",
    "recording_url": "https://cdn.pixabay.com/download/audio/2021/08/08/audio_1a1a1b1d93.mp3"
  }')

echo "$RESPONSE"
echo ""

# Test 4: If successful, test analyze endpoint
if [[ "$RESPONSE" == *"callId"* ]]; then
  CALL_ID=$(echo "$RESPONSE" | grep -o '"callId":"[^"]*"' | cut -d'"' -f4)
  echo "4. Testing analyze endpoint with call_id: $CALL_ID"
  curl -s -X POST "https://synced-up-call-ai.vercel.app/api/jobs/analyze" \
    -H "Authorization: Bearer dffrgvioervov554w8cwswiocvjsd" \
    -H "Content-Type: application/json" \
    -d '{"call_id": "'$CALL_ID'"}'
else
  echo "4. Cannot test analyze endpoint - webhook failed"
fi

echo ""
echo "=== Troubleshooting ==="
echo "If you see HTTP 500 errors, check:"
echo "1. All tables exist in Supabase (contacts, agents, calls, call_events)"
echo "2. The agency_id column was added to calls table"
echo "3. Database connection string uses the pooler URL"
echo "4. Check Vercel function logs for detailed error messages"