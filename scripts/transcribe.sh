#!/bin/sh
# transcribe.sh - Start transcription for a call
set -e

# Load environment variables
if [ -f "$(dirname "$0")/.env" ]; then
    . "$(dirname "$0")/.env"
elif [ -f "$(dirname "$0")/.env.example" ]; then
    echo "Error: .env not found. Copy .env.example to .env and configure it."
    exit 1
fi

# Validate required variables
if [ -z "$APP_URL" ] || [ -z "$JOBS_SECRET" ]; then
    echo "Error: APP_URL and JOBS_SECRET must be set in .env"
    exit 1
fi

# Get call ID from argument
CALL_ID=${1:-}
if [ -z "$CALL_ID" ]; then
    echo "Usage: $0 <call_id>"
    echo "Example: $0 abc123-def456"
    exit 1
fi

echo "Starting transcription for call: $CALL_ID"
echo ""

# Trigger transcription job
RESPONSE=$(curl -s -X POST "$APP_URL/api/jobs/transcribe" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JOBS_SECRET" \
  -d "{\"callId\": \"$CALL_ID\"}")

echo "Response: $RESPONSE"

# Check if successful
if echo "$RESPONSE" | grep -q '"ok":true'; then
    echo ""
    echo "✅ Transcription job started successfully"
    echo "Use stream-status.sh to monitor progress"
else
    echo ""
    echo "❌ Failed to start transcription"
    exit 1
fi