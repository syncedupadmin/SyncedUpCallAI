#!/bin/sh
# batch-progress.sh - Poll batch job and print % complete
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

echo "Starting batch job and monitoring progress..."
echo ""

# Start batch job
RESPONSE=$(curl -s -X GET "$APP_URL/api/jobs/batch" \
  -H "Authorization: Bearer $JOBS_SECRET")

echo "Initial response: $RESPONSE"
echo ""

# Extract batch_id and initial counts
BATCH_ID=$(echo "$RESPONSE" | sed -n 's/.*"batch_id":"\([^"]*\)".*/\1/p')
TOTAL=$(echo "$RESPONSE" | sed -n 's/.*"scanned":\([0-9]*\).*/\1/p')

if [ -z "$BATCH_ID" ] || [ -z "$TOTAL" ] || [ "$TOTAL" = "0" ]; then
    echo "No calls to process or failed to start batch"
    exit 0
fi

echo "Batch ID: $BATCH_ID"
echo "Total calls to process: $TOTAL"
echo ""
echo "Progress:"

# Poll for progress
while true; do
    sleep 2
    
    # Get progress update
    PROGRESS=$(curl -s -X GET "$APP_URL/api/jobs/batch?batch_id=$BATCH_ID" \
      -H "Authorization: Bearer $JOBS_SECRET")
    
    # Extract progress values
    if echo "$PROGRESS" | grep -q '"progress"'; then
        COMPLETED=$(echo "$PROGRESS" | sed -n 's/.*"completed":\([0-9]*\).*/\1/p')
        FAILED=$(echo "$PROGRESS" | sed -n 's/.*"failed":\([0-9]*\).*/\1/p')
        POSTED=$(echo "$PROGRESS" | sed -n 's/.*"posted":\([0-9]*\).*/\1/p')
        
        COMPLETED=${COMPLETED:-0}
        FAILED=${FAILED:-0}
        DONE=$((COMPLETED + FAILED))
        
        # Calculate percentage
        if [ "$TOTAL" -gt 0 ]; then
            PERCENT=$((DONE * 100 / TOTAL))
        else
            PERCENT=0
        fi
        
        # Print progress bar
        printf "\r["
        i=0
        while [ $i -lt 20 ]; do
            if [ $i -lt $((PERCENT / 5)) ]; then
                printf "="
            else
                printf " "
            fi
            i=$((i + 1))
        done
        printf "] %3d%% (%d/%d completed, %d failed)" "$PERCENT" "$COMPLETED" "$TOTAL" "$FAILED"
        
        # Check if done
        if [ "$DONE" -ge "$TOTAL" ]; then
            echo ""
            echo ""
            echo "✅ Batch processing complete!"
            echo "  Completed: $COMPLETED"
            echo "  Failed: $FAILED"
            break
        fi
    else
        echo ""
        echo "Failed to get progress update"
        break
    fi
done