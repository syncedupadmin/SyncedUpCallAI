#!/bin/sh
# download-transcript.sh - Save transcript file to ./out/<call_id>.txt
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

# Create output directory if it doesn't exist
OUT_DIR="$(dirname "$0")/out"
mkdir -p "$OUT_DIR"

OUTPUT_FILE="$OUT_DIR/${CALL_ID}.txt"

echo "Downloading transcript for call: $CALL_ID"
echo "Output file: $OUTPUT_FILE"
echo ""

# Download transcript
HTTP_CODE=$(curl -s -w "%{http_code}" -o "$OUTPUT_FILE" \
  "$APP_URL/api/ui/call/export?id=$CALL_ID&format=txt")

if [ "$HTTP_CODE" = "200" ]; then
    # Check if file has content
    if [ -s "$OUTPUT_FILE" ]; then
        echo "✅ Transcript downloaded successfully"
        echo ""
        echo "File details:"
        echo "  Size: $(wc -c < "$OUTPUT_FILE") bytes"
        echo "  Lines: $(wc -l < "$OUTPUT_FILE")"
        echo ""
        echo "Preview (first 5 lines):"
        echo "---"
        head -n 5 "$OUTPUT_FILE"
        echo "---"
        echo ""
        echo "Full transcript saved to: $OUTPUT_FILE"
    else
        echo "❌ Downloaded file is empty"
        rm -f "$OUTPUT_FILE"
        exit 1
    fi
else
    echo "❌ Failed to download transcript (HTTP $HTTP_CODE)"
    rm -f "$OUTPUT_FILE"
    
    # Try to show error message
    ERROR=$(curl -s "$APP_URL/api/ui/call/export?id=$CALL_ID&format=txt")
    echo "Error: $ERROR"
    exit 1
fi