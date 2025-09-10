#!/bin/bash

# Test Convoso Webhook Setup
echo "Testing Convoso Webhook Integration"
echo "===================================="

# Set the webhook secret
CONVOSO_WEBHOOK_SECRET="8nf3i9mmzoxidg3ntm28gbxvlhdiqo3p"

# Test 1: Health Check
echo -e "\n1. Health Check:"
curl -s "https://synced-up-call-ai.vercel.app/api/health" | jq .

# Test 2: Webhook with correct Convoso format
echo -e "\n2. Testing Convoso Webhook:"
RESPONSE=$(curl -s -X POST "https://synced-up-call-ai.vercel.app/api/hooks/convoso" \
  -H "x-webhook-secret: ${CONVOSO_WEBHOOK_SECRET}" \
  -H "x-agency-id: test-agency" \
  -H "Content-Type: application/json" \
  -d '{
    "lead_id": "L-'$(date +%s)'",
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

if [ -z "$RESPONSE" ]; then
  echo "Empty response - likely database connection issue"
else
  echo "$RESPONSE" | jq .
fi

# Test 3: Analyze endpoint (if call was created)
if [[ "$RESPONSE" == *"callId"* ]]; then
  CALL_ID=$(echo "$RESPONSE" | jq -r .callId)
  echo -e "\n3. Testing Analyze Endpoint with call_id: $CALL_ID"
  
  JOBS_SECRET="dffrgvioervov554w8cwswiocvjsd"
  curl -s -X POST "https://synced-up-call-ai.vercel.app/api/jobs/analyze" \
    -H "Authorization: Bearer ${JOBS_SECRET}" \
    -H "Content-Type: application/json" \
    -d '{"call_id": "'$CALL_ID'"}' | jq .
fi

echo -e "\n===================================="
echo "Notes:"
echo "- Empty webhook response usually means database connection issues"
echo "- Check Vercel logs for detailed error messages"
echo "- Ensure DATABASE_URL is properly set in Vercel environment variables"