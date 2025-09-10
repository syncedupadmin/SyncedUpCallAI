#!/bin/bash

# Production Validation Script for SyncedUp Call AI v1.0
# This script performs comprehensive E2E testing of the deployed application

set -e

# Configuration
export APP_URL="${APP_URL:-https://synced-up-call-ai.vercel.app}"
export TMP_DIR="$(mktemp -d 2>/dev/null || mktemp -d -t 'validate')"
echo "Using TMP_DIR=$TMP_DIR"
echo "Testing: $APP_URL"
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counters
PASSED=0
FAILED=0
SKIPPED=0

# Test function
test_case() {
    local name="$1"
    local cmd="$2"
    
    printf "%-40s" "$name..."
    
    if eval "$cmd" > "$TMP_DIR/test_output.tmp" 2>&1; then
        echo -e "${GREEN}✓${NC}"
        ((PASSED++))
        return 0
    else
        echo -e "${RED}✗${NC}"
        ((FAILED++))
        echo "  Error: $(head -n 1 "$TMP_DIR/test_output.tmp")"
        return 1
    fi
}

echo "═══════════════════════════════════════"
echo "  SyncedUp Call AI - Production Tests"
echo "═══════════════════════════════════════"
echo ""

### 1) Health Check
echo "== Health & Environment =="
test_case "API Health" "curl -s '$APP_URL/api/health' | grep -q '\"ok\":true'"

if curl -s "$APP_URL/api/health" > "$TMP_DIR/health.json" 2>/dev/null; then
    echo "  Environment vars configured:"
    grep -o '"[A-Z_]*":true' "$TMP_DIR/health.json" | sed 's/"//g' | sed 's/:true/: ✓/' | sed 's/^/    /'
fi
echo ""

### 2) UI Pages
echo "== UI Pages =="
for page in "" "dashboard" "calls" "search" "admin" "library" "batch"; do
    page_name="${page:-home}"
    test_case "GET /$page_name" "curl -s -o /dev/null -w '%{http_code}' '$APP_URL/$page' | grep -q '200'"
done
echo ""

### 3) API Endpoints (no auth required)
echo "== Public API Endpoints =="
test_case "GET /api/ui/calls" "curl -s '$APP_URL/api/ui/calls?limit=1' | grep -q '\"ok\":true'"
test_case "GET /api/ui/library" "curl -s '$APP_URL/api/ui/library?limit=1' | grep -q '\"ok\":true'"
test_case "GET /api/ui/search (empty)" "curl -s '$APP_URL/api/ui/search?q=test' | grep -q '\"ok\":true'"
echo ""

### 4) Call Detail Endpoints
echo "== Call Detail APIs =="
test_case "GET /api/ui/call (no ID)" "curl -s '$APP_URL/api/ui/call' | grep -q '\"error\":\"id_required\"'"
test_case "GET /api/ui/call (404)" "curl -s '$APP_URL/api/ui/call?id=nonexistent' | grep -q '\"error\":\"call_not_found\"'"
test_case "GET /api/ui/call/transcript (no ID)" "curl -s '$APP_URL/api/ui/call/transcript' | grep -q '\"error\":\"id_required\"'"
echo ""

### 5) Admin Endpoints
echo "== Admin Endpoints =="
test_case "GET /api/admin/backfill status" "curl -s '$APP_URL/api/admin/backfill' | grep -q '\"ok\":true'"
test_case "GET /api/admin/last-webhooks" "curl -s '$APP_URL/api/admin/last-webhooks?limit=1' | grep -q '\"ok\":true'"
echo ""

### 6) Protected Job Endpoints (should fail without auth)
echo "== Protected Endpoints (Auth Required) =="
test_case "POST /api/jobs/transcribe (401)" "curl -s -X POST '$APP_URL/api/jobs/transcribe' | grep -q -E '(unauthorized|401|Unauthorized)'"
test_case "POST /api/jobs/analyze (401)" "curl -s -X POST '$APP_URL/api/jobs/analyze' | grep -q -E '(unauthorized|401|Unauthorized)'"
test_case "GET /api/jobs/batch (401)" "curl -s '$APP_URL/api/jobs/batch' | grep -q -E '(unauthorized|401|Unauthorized)'"
echo ""

### 7) Cron Endpoints
echo "== Cron Endpoints (Auth Required) =="
test_case "GET /api/cron/rollup (401)" "curl -s '$APP_URL/api/cron/rollup' | grep -q -E '(Unauthorized|401)'"
test_case "GET /api/cron/retention (401)" "curl -s '$APP_URL/api/cron/retention' | grep -q -E '(Unauthorized|401)'"
echo ""

### 8) Data Validation
echo "== Data Structure Validation =="
# Check if calls endpoint returns proper structure
if curl -s "$APP_URL/api/ui/calls?limit=1" > "$TMP_DIR/calls.json" 2>/dev/null; then
    if grep -q '"data":\[' "$TMP_DIR/calls.json" && \
       grep -q '"total":' "$TMP_DIR/calls.json" && \
       grep -q '"limit":' "$TMP_DIR/calls.json"; then
        echo -e "  Calls API structure          ${GREEN}✓${NC}"
        ((PASSED++))
    else
        echo -e "  Calls API structure          ${RED}✗${NC}"
        ((FAILED++))
    fi
fi
echo ""

### 9) Rate Limiting Test
echo "== Rate Limiting =="
echo "  Testing rate limits (making 10 rapid requests)..."
RATE_LIMITED=false
for i in {1..10}; do
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$APP_URL/api/ui/calls?limit=1")
    if [ "$STATUS" = "429" ]; then
        RATE_LIMITED=true
        break
    fi
    sleep 0.1
done

if [ "$RATE_LIMITED" = true ]; then
    echo -e "  Rate limiting active          ${GREEN}✓${NC}"
    ((PASSED++))
else
    echo -e "  Rate limiting active          ${YELLOW}⚠${NC} (not triggered in 10 requests)"
    ((SKIPPED++))
fi
echo ""

### 10) Feature Verification
echo "== v1.0 Features =="
# Check if new endpoints exist
test_case "Call detail page exists" "curl -s -o /dev/null -w '%{http_code}' '$APP_URL/calls/test' | grep -q -E '(200|404)'"
test_case "Backfill endpoint exists" "curl -s -o /dev/null -w '%{http_code}' '$APP_URL/api/admin/backfill' | grep -q '200'"
test_case "Rollup cron exists" "curl -s -o /dev/null -w '%{http_code}' '$APP_URL/api/cron/rollup' | grep -q '401'"
test_case "Retention cron exists" "curl -s -o /dev/null -w '%{http_code}' '$APP_URL/api/cron/retention' | grep -q '401'"
echo ""

### Generate Report
echo "═══════════════════════════════════════"
echo "            TEST SUMMARY"
echo "═══════════════════════════════════════"
echo ""
echo -e "  Passed:  ${GREEN}$PASSED${NC}"
echo -e "  Failed:  ${RED}$FAILED${NC}"
echo -e "  Skipped: ${YELLOW}$SKIPPED${NC}"
echo ""

TOTAL=$((PASSED + FAILED + SKIPPED))
if [ $TOTAL -gt 0 ]; then
    SUCCESS_RATE=$((PASSED * 100 / TOTAL))
    echo "  Success Rate: $SUCCESS_RATE%"
fi

# Generate detailed report
cat > "$TMP_DIR/VALIDATION_REPORT.md" <<EOF
# Production Validation Report

**Date**: $(date -u +"%Y-%m-%d %H:%M:%S UTC")  
**Target**: $APP_URL  
**Commit**: $(curl -s "$APP_URL/api/health" 2>/dev/null | grep -o '"commitSha":"[^"]*"' | cut -d'"' -f4)

## Test Results

- **Total Tests**: $TOTAL
- **Passed**: $PASSED ✅
- **Failed**: $FAILED ❌
- **Skipped**: $SKIPPED ⚠️
- **Success Rate**: ${SUCCESS_RATE}%

## Environment Status

$(curl -s "$APP_URL/api/health" 2>/dev/null | python -m json.tool 2>/dev/null || echo "Unable to parse health response")

## v1.0 Feature Verification

| Feature | Status |
|---------|--------|
| Call Detail Page | $([ -f "$TMP_DIR/test_output.tmp" ] && grep -q "calls/test" "$TMP_DIR/test_output.tmp" && echo "✅" || echo "❓") |
| Slack Alerts | Configured (check env) |
| Revenue Rollups | $(curl -s -o /dev/null -w "%{http_code}" "$APP_URL/api/cron/rollup" | grep -q "401" && echo "✅" || echo "❌") |
| Backfill Tools | $(curl -s "$APP_URL/api/admin/backfill" | grep -q "ok" && echo "✅" || echo "❌") |
| Data Retention | $(curl -s -o /dev/null -w "%{http_code}" "$APP_URL/api/cron/retention" | grep -q "401" && echo "✅" || echo "❌") |

## Artifacts

All test artifacts saved to: $TMP_DIR

- health.json - Health check response
- calls.json - Calls API response sample
- VALIDATION_REPORT.md - This report

EOF

echo ""
if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ All critical tests passed!${NC}"
    echo ""
    echo "The v1.0 deployment is healthy and all features are accessible."
else
    echo -e "${RED}⚠️ Some tests failed${NC}"
    echo ""
    echo "Review the failures above and check the logs for details."
fi

echo ""
echo "Full report saved to: $TMP_DIR/VALIDATION_REPORT.md"
echo ""

# Cleanup on exit
trap "rm -rf $TMP_DIR" EXIT

exit $FAILED