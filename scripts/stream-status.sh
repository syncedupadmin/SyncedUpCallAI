#!/bin/sh
# stream-status.sh - Tail SSE events for a call
set -e

# Load environment variables
if [ -f "$(dirname "$0")/.env" ]; then
    . "$(dirname "$0")/.env"
elif [ -f "$(dirname "$0")/.env.example" ]; then
    echo "Error: .env not found. Copy .env.example to .env and configure it."
    exit 1
fi

# Validate required variables
if [ -z "$APP_URL" ]; then
    echo "Error: APP_URL must be set in .env"
    exit 1
fi

# Get call ID from argument
CALL_ID=${1:-}
if [ -z "$CALL_ID" ]; then
    echo "Usage: $0 <call_id>"
    echo "Example: $0 abc123-def456"
    exit 1
fi

echo "Streaming status for call: $CALL_ID"
echo "Press Ctrl+C to stop"
echo ""
echo "Connecting to: $APP_URL/api/ui/stream/$CALL_ID"
echo "---"

# Stream SSE events with timestamps
curl -N -H "Accept: text/event-stream" "$APP_URL/api/ui/stream/$CALL_ID" 2>/dev/null | while IFS= read -r line; do
    if [ -n "$line" ]; then
        timestamp=$(date '+%Y-%m-%d %H:%M:%S')
        echo "[$timestamp] $line"
        
        # Parse and format status events
        if echo "$line" | grep -q '^data:'; then
            data=$(echo "$line" | sed 's/^data: //')
            if echo "$data" | grep -q '"status"'; then
                status=$(echo "$data" | sed -n 's/.*"status":"\([^"]*\)".*/\1/p')
                case "$status" in
                    "queued")
                        echo "  ⏳ Call queued for processing"
                        ;;
                    "transcribing")
                        echo "  🎤 Transcription in progress..."
                        ;;
                    "analyzing")
                        echo "  🤖 Analysis in progress..."
                        ;;
                    "done")
                        echo "  ✅ Processing complete!"
                        ;;
                    "error")
                        echo "  ❌ Error occurred during processing"
                        ;;
                esac
            fi
        fi
    fi
done