#!/bin/bash

echo "Testing Rate Limiting on SyncedUpCallAI Production"
echo "=================================================="
echo ""

# Test transcribe endpoint (limit: 10/min)
echo "Testing /api/jobs/transcribe (Limit: 10 requests/minute)"
echo "---------------------------------------------------------"

for i in {1..15}; do
  echo -n "Request $i: "
  response=$(curl -s -w "\nSTATUS:%{http_code}\n" -X POST https://syncedupcallai.vercel.app/api/jobs/transcribe \
    -H "Content-Type: application/json" \
    -d '{"test": true}' 2>/dev/null)

  status=$(echo "$response" | grep "STATUS:" | cut -d: -f2)

  if [ "$status" = "429" ]; then
    echo "❌ Rate limited (429)"
  elif [ "$status" = "401" ]; then
    echo "✓ Auth required (401)"
  else
    echo "Status: $status"
  fi

  # Small delay to avoid overwhelming
  sleep 0.2
done

echo ""
echo "Testing /api/jobs/analyze (Limit: 20 requests/minute)"
echo "------------------------------------------------------"

for i in {1..25}; do
  echo -n "Request $i: "
  response=$(curl -s -w "\nSTATUS:%{http_code}\n" -X POST https://syncedupcallai.vercel.app/api/jobs/analyze \
    -H "Content-Type: application/json" \
    -d '{"test": true}' 2>/dev/null)

  status=$(echo "$response" | grep "STATUS:" | cut -d: -f2)

  if [ "$status" = "429" ]; then
    echo "❌ Rate limited (429)"
  elif [ "$status" = "401" ]; then
    echo "✓ Auth required (401)"
  else
    echo "Status: $status"
  fi

  # Small delay to avoid overwhelming
  sleep 0.2
done

echo ""
echo "Test Complete!"
echo ""
echo "Expected Results:"
echo "- transcribe: First 10 requests = 401, requests 11-15 = 429"
echo "- analyze: First 20 requests = 401, requests 21-25 = 429"