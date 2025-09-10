#!/bin/sh
# seed-call.sh - Seed a test call via Convoso webhook
set -e

# Load environment variables
if [ -f "$(dirname "$0")/.env" ]; then
    . "$(dirname "$0")/.env"
elif [ -f "$(dirname "$0")/.env.example" ]; then
    echo "Error: .env not found. Copy .env.example to .env and configure it."
    exit 1
fi

# Validate required variables
if [ -z "$APP_URL" ] || [ -z "$WEBHOOK_SECRET" ]; then
    echo "Error: APP_URL and WEBHOOK_SECRET must be set in .env"
    exit 1
fi

# Generate a test call ID
CALL_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "test-$(date +%s)")

# Create sample Convoso payload
PAYLOAD=$(cat <<EOF
{
  "id": "$CALL_ID",
  "agent_name": "Test Agent",
  "agent_team": "QA Team",
  "customer_phone": "+15551234567",
  "started_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "ended_at": "$(date -u -d '+2 minutes' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u +%Y-%m-%dT%H:%M:%SZ)",
  "duration_sec": 120,
  "disposition": "SALE",
  "campaign": "Test Campaign",
  "direction": "outbound",
  "recording_url": "https://example.com/test-recording.mp3"
}
EOF
)

echo "Seeding call with ID: $CALL_ID"
echo "Payload: $PAYLOAD"
echo ""

# Send webhook request
RESPONSE=$(curl -s -X POST "$APP_URL/api/hooks/convoso" \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: $WEBHOOK_SECRET" \
  -d "$PAYLOAD")

echo "Response: $RESPONSE"
echo ""
echo "Call ID: $CALL_ID"
echo "Save this ID for subsequent tests"