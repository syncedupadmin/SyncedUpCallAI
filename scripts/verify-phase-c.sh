#!/bin/bash

# Phase C Verification Script
# Tests all endpoints and features added in Phase C

BASE_URL=${APP_URL:-"http://localhost:3002"}
CRON_SECRET=${CRON_SECRET:-"test-cron-secret"}
JOBS_SECRET=${JOBS_SECRET:-"test-jobs-secret"}

echo "=== Phase C Verification ==="
echo "Testing against: $BASE_URL"
echo ""

# 1. Test Convoso Delta Cron
echo "1. Testing Convoso Delta Cron..."
curl -s -X GET "$BASE_URL/api/cron/convoso-delta" \
  -H "x-vercel-cron: 1" \
  -H "x-cron-secret: $CRON_SECRET" \
  -o /tmp/cron-response.json

if grep -q '"ok":true' /tmp/cron-response.json; then
  echo "✅ Cron endpoint working"
  echo "   Response: $(cat /tmp/cron-response.json | head -c 100)..."
else
  echo "❌ Cron endpoint failed"
  cat /tmp/cron-response.json
fi
echo ""

# 2. Test Convoso Status
echo "2. Testing Convoso Status..."
curl -s "$BASE_URL/api/integrations/convoso/status" \
  -o /tmp/status-response.json

if grep -q '"ok":true' /tmp/status-response.json; then
  echo "✅ Status endpoint working"
  health=$(grep -o '"status":"[^"]*"' /tmp/status-response.json | head -1)
  echo "   Health: $health"
else
  echo "❌ Status endpoint failed"
fi
echo ""

# 3. Test Agent Calls API
echo "3. Testing Agent Calls API..."
curl -s "$BASE_URL/api/ui/agents/calls?limit=5&offset=0" \
  -o /tmp/agents-response.json

if grep -q '"ok":true' /tmp/agents-response.json; then
  echo "✅ Agent calls endpoint working"
  total=$(grep -o '"total":[0-9]*' /tmp/agents-response.json | head -1)
  echo "   $total agents found"
else
  echo "❌ Agent calls endpoint failed"
fi
echo ""

# 4. Test Convoso Ingest (requires JOBS_SECRET)
echo "4. Testing Convoso Ingest..."
curl -s -X POST "$BASE_URL/api/integrations/convoso/ingest" \
  -H "x-jobs-secret: $JOBS_SECRET" \
  -H "content-type: application/json" \
  -d '{"pages":1,"perPage":10}' \
  -o /tmp/ingest-response.json

if grep -q '"ok":true' /tmp/ingest-response.json; then
  echo "✅ Ingest endpoint working"
  scanned=$(grep -o '"scanned":[0-9]*' /tmp/ingest-response.json | head -1)
  echo "   $scanned records"
else
  echo "❌ Ingest endpoint failed (check JOBS_SECRET)"
fi
echo ""

# 5. Check Files Exist
echo "5. Checking File Structure..."
FILES=(
  "src/app/api/cron/convoso-delta/route.ts"
  "src/app/api/integrations/convoso/status/route.ts"
  "src/app/admin/parts/ConvosoPanel.tsx"
  "src/components/AgentFilters.tsx"
  ".github/workflows/convoso-smoke.yml"
  "vercel.json"
)

for file in "${FILES[@]}"; do
  if [ -f "$file" ]; then
    echo "✅ $file exists"
  else
    echo "❌ $file missing"
  fi
done
echo ""

# 6. Check Vercel.json includes cron
echo "6. Checking Vercel Cron Configuration..."
if grep -q "convoso-delta" vercel.json; then
  echo "✅ Convoso delta cron configured in vercel.json"
  grep -A 2 "convoso-delta" vercel.json | sed 's/^/   /'
else
  echo "❌ Convoso delta cron NOT in vercel.json"
fi
echo ""

echo "=== Verification Complete ==="
echo ""
echo "Next Steps:"
echo "1. Deploy to Vercel: git push"
echo "2. Set environment variables in Vercel:"
echo "   - CRON_SECRET"
echo "   - CONVOSO_AUTH_TOKEN"
echo "   - CONVOSO_DELTA_MINUTES (default: 15)"
echo "3. Verify cron appears in Vercel Dashboard → Settings → Cron Jobs"
echo "4. Test production endpoints with proper secrets"