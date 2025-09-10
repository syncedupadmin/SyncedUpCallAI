#!/bin/sh
# analyze.sh - Start analysis for a call
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

echo "Starting analysis for call: $CALL_ID"
echo ""

# Trigger analysis job
RESPONSE=$(curl -s -X POST "$APP_URL/api/jobs/analyze" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JOBS_SECRET" \
  -d "{\"callId\": \"$CALL_ID\"}")

echo "Response: $RESPONSE"

# Check if successful
if echo "$RESPONSE" | grep -q '"ok":true'; then
    echo ""
    echo "✅ Analysis job started successfully"
    
    # Check for embedding skip
    if echo "$RESPONSE" | grep -q '"embedding_skipped":true'; then
        echo "ℹ️  Embedding was skipped (already exists)"
    fi
    
    echo "Use stream-status.sh to monitor progress"
else
    echo ""
    echo "❌ Failed to start analysis"
    exit 1
fi