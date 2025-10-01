#!/bin/bash

# Get auth token from environment
AUTH_TOKEN="${CONVOSO_AUTH_TOKEN}"

if [ -z "$AUTH_TOKEN" ]; then
  echo "Error: CONVOSO_AUTH_TOKEN not set"
  exit 1
fi

echo "=== Testing Convoso API Endpoints ==="
echo ""

# Calculate dates
END_DATE=$(date +%Y-%m-%d)
START_DATE=$(date -d "30 days ago" +%Y-%m-%d)

echo "1. Testing /agent-performance/search"
echo "   Fetching first agent to see fields..."
curl -s "https://api.convoso.com/v1/agent-performance/search?auth_token=${AUTH_TOKEN}&date_start=${START_DATE}&date_end=${END_DATE}" | python3 -m json.tool | head -100

echo ""
echo "2. Extracting first user_id from agent-performance..."
FIRST_USER_ID=$(curl -s "https://api.convoso.com/v1/agent-performance/search?auth_token=${AUTH_TOKEN}&date_start=${START_DATE}&date_end=${END_DATE}" | python3 -c "import sys,json; data=json.load(sys.stdin); agents=list(data['data'].values()); print(agents[0]['user_id'] if agents else '')" 2>/dev/null)

echo "   First user_id: ${FIRST_USER_ID}"
echo ""

if [ -n "$FIRST_USER_ID" ]; then
  echo "3. Testing /users/recordings with user_id=${FIRST_USER_ID}"
  curl -s "https://api.convoso.com/v1/users/recordings?auth_token=${AUTH_TOKEN}&user=${FIRST_USER_ID}&limit=2" | python3 -m json.tool
fi
