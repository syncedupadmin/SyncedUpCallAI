# Convoso Integration Specification

## Phase A - Discovery & Specification

### 1. Authentication & API Details

**Auth Method:** Token-based authentication via query parameter
- Parameter: `auth_token`
- Required on all API requests
- No OAuth flow required

**Base URL:** `https://api.convoso.com/v1/`

**Rate Limits:**
- Not documented publicly, but based on testing:
  - Recommended: 10 requests per second max
  - Use exponential backoff on 429 responses
  - Batch requests where possible (100-500 records per page)

### 2. Key Endpoints

#### Call Records Endpoint
- **GET** `/lead/get-recordings`
- Query Parameters:
  - `auth_token` (required)
  - `offset` - Pagination offset (default: 0)
  - `limit` - Records per page (max: 500, recommended: 100)
  - `start_date` - ISO format YYYY-MM-DD
  - `end_date` - ISO format YYYY-MM-DD
  - `agent_id` - Filter by specific agent
  - `disposition` - Filter by call disposition
  - `campaign_id` - Filter by campaign

#### Response Fields (observed from existing integration):
```json
{
  "success": true,
  "data": [
    {
      "call_id": "unique-call-id",
      "lead_id": "lead-uuid",
      "agent_id": "agent-123",
      "agent_name": "John Doe",
      "campaign_id": "camp-456",
      "campaign_name": "Q1 Outbound",
      "disposition": "SALE",
      "phone_number": "5551234567",
      "start_time": "2025-01-14T10:00:00Z",
      "end_time": "2025-01-14T10:05:30Z",
      "duration": 330,  // seconds
      "talk_time": 300,  // seconds
      "wrap_time": 30,   // seconds
      "recording_url": "https://recordings.convoso.com/...",
      "direction": "outbound",
      "queue": "sales_queue",
      "language": "en",
      "tags": ["first_call", "qualified"]
    }
  ],
  "total": 1530,
  "offset": 0,
  "limit": 100
}
```

### 3. Webhook Support

**Current Status:** Webhooks ARE supported and already implemented
- Endpoint: `/api/webhooks/convoso` (call data)
- Endpoint: `/api/webhooks/convoso-leads` (lead data)
- Signature verification via `x-convoso-signature` header with HMAC-SHA256

### 4. Field Mapping

| Convoso Field | Our Column | Transform |
|--------------|------------|-----------|
| call_id | id (UUID) | Generate UUID v5 from convoso call_id |
| lead_id | lead_id | Direct map |
| agent_id | agent_id | Direct map (FK to agents.ext_ref) |
| agent_name | agent_name | Direct map |
| campaign_name | campaign | Direct map |
| phone_number | primary_phone | Normalize to digits only |
| start_time | started_at | Parse ISO to timestamptz |
| end_time | ended_at | Parse ISO to timestamptz |
| duration | duration_sec | Direct map (already in seconds) |
| talk_time | talk_time_sec | Direct map |
| wrap_time | wrap_time_sec | Direct map |
| disposition | disposition | Direct map |
| recording_url | recording_url | Direct map |
| direction | direction | Default 'outbound' if missing |
| queue | queue | Store in metadata |
| language | language | Store in metadata |
| tags | tags | Store in metadata as array |

### 5. Database Schema Strategy

**Recommendation:** Use EXISTING `calls` table with additions rather than new tables
- Minimizes code changes
- Preserves existing functionality
- Adds columns for Convoso-specific needs

**Required Schema Additions:**
```sql
-- Add to existing calls table
ALTER TABLE calls ADD COLUMN IF NOT EXISTS agent_name text;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS agent_email text;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS lead_id text;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS talk_time_sec int;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS wrap_time_sec int;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS queue text;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS language text;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS tags text[];
ALTER TABLE calls ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}';
ALTER TABLE calls ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE calls ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Ensure source column can identify Convoso calls
-- (already exists, just ensure it's used: source = 'convoso')

-- Add indexes for agent grouping and filtering
CREATE INDEX IF NOT EXISTS idx_calls_agent_name ON calls(agent_name, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_calls_source_agent ON calls(source, agent_name, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_calls_lead_id ON calls(lead_id);
CREATE INDEX IF NOT EXISTS idx_calls_tags ON calls USING gin(tags);
```

### 6. Integration Mode

**Hybrid Approach (Recommended):**

1. **Webhooks (Primary)** - Already implemented for real-time updates
   - Receiving call completion events
   - Signature verification in place
   - Handles missing recordings with retry queue

2. **Polling API (Secondary)** - For backfill and reconciliation
   - Daily cron for previous day's delta
   - Manual backfill endpoint for historical data
   - Reconciliation to catch any missed webhooks

### 7. Security & Configuration

**Existing Environment Variables:**
- `CONVOSO_WEBHOOK_SECRET` - For webhook signature verification
- `CONVOSO_AUTH_TOKEN` - For API calls

**New Environment Variables Needed:**
- `CONVOSO_BASE_URL` - Default: `https://api.convoso.com/v1/`
- `CONVOSO_POLLING_ENABLED` - Feature flag for API polling
- `CONVOSO_MAX_RETRIES` - Default: 3
- `CONVOSO_RETRY_DELAY_MS` - Default: 1000

### 8. Error Handling & Retry Policy

1. **API Errors:**
   - 401: Invalid token → Log and alert admin
   - 429: Rate limited → Exponential backoff
   - 500-504: Server errors → Retry with backoff
   - Network errors → Circuit breaker pattern

2. **Data Validation:**
   - Missing required fields → Log and store in metadata
   - Invalid dates → Use current timestamp
   - Duplicate calls → Upsert pattern

3. **Circuit Breaker:**
   - Open after 5 consecutive failures
   - Half-open after 60 seconds
   - Close after 3 consecutive successes

## Phase B Task List

### 1. Database Migration
- [ ] Create `migrations/006_convoso_enhancements.sql`
- [ ] Add columns to existing calls table
- [ ] Add new indexes for agent grouping

### 2. Convoso Client
- [ ] Create `src/server/convoso/types.ts` - TypeScript interfaces
- [ ] Create `src/server/convoso/client.ts` - API wrapper with retry logic
- [ ] Reuse existing `src/server/lib/circuit.ts` for circuit breaker

### 3. Database Access Layer
- [ ] Create `src/server/db/convoso.ts` - Upsert helpers for agents and calls
- [ ] Add `getCallsGroupedByAgent()` function

### 4. API Routes
- [ ] Create `src/app/api/integrations/convoso/ingest/route.ts` - Pull and upsert
- [ ] Create `src/app/api/integrations/convoso/backfill/route.ts` - Historical import
- [ ] Enhance existing webhook at `src/app/api/webhooks/convoso/route.ts`
- [ ] Create `src/app/api/ui/agents/calls/route.ts` - Agent-grouped endpoint

### 5. UI Integration
- [ ] Add agent filter to existing `/calls` page
- [ ] Use new `/api/ui/agents/calls` endpoint when grouping by agent
- [ ] Keep existing functionality intact

### 6. Admin Panel
- [ ] Enhance `/admin/super` with Convoso sync controls
- [ ] Add backfill and delta sync buttons
- [ ] Show last sync timestamp and counts

### 7. Cron Job
- [ ] Add Vercel cron configuration for 15-minute delta sync
- [ ] Reuse existing cron infrastructure

### 8. Testing & Verification
- [ ] Create `scripts/convoso-verify.mjs` for testing
- [ ] Update E2E test suite
- [ ] Document curl examples

## Implementation Priority

1. **High Priority:**
   - Database migration (non-breaking additions)
   - Convoso client with proper auth
   - Agent-grouped API endpoint
   - Basic ingest endpoint

2. **Medium Priority:**
   - Backfill functionality
   - Admin panel enhancements
   - Cron job setup

3. **Low Priority:**
   - Advanced filtering options
   - Performance optimizations
   - Extended metadata storage

## Open Questions

1. Should we migrate historical Convoso data from the existing webhook-captured calls?
2. Do we need to handle agent hierarchy (teams/supervisors)?
3. Should we store raw Convoso responses for audit purposes?
4. Rate limit strategy - should we implement request queuing?

## Success Criteria

- [ ] Can ingest calls via API with proper auth
- [ ] Calls are grouped by agent in UI
- [ ] Pagination works correctly
- [ ] Filters (date, disposition, agent) function properly
- [ ] No disruption to existing webhook flow
- [ ] Circuit breaker prevents API hammering
- [ ] Admin can trigger manual sync
- [ ] Cron runs delta sync every 15 minutes

## API Usage Examples

### Ingest Calls from Convoso

```bash
# One-page ingest (last 7 days)
curl -s -X POST "$APP_URL/api/integrations/convoso/ingest" \
  -H "x-jobs-secret: $JOBS_SECRET" \
  -H "content-type: application/json" \
  -d '{
    "pages": 1,
    "perPage": 50,
    "from": "'$(date -d '7 days ago' --iso-8601)'",
    "to": "'$(date --iso-8601)'"
  }' | jq '.'

# Response:
# {
#   "ok": true,
#   "scanned": 45,
#   "inserted": 12,
#   "updated": 33,
#   "failed": 0,
#   "duration_ms": 2341
# }
```

### Get Agent-Grouped Calls

```bash
# Get top 10 agents by call volume
curl -s "$APP_URL/api/ui/agents/calls?limit=10&offset=0" | jq '.'

# With date filter (last 30 days)
curl -s "$APP_URL/api/ui/agents/calls?limit=10&offset=0&from=2025-08-15&to=2025-09-14" | jq '.'

# Filter by specific agent
curl -s "$APP_URL/api/ui/agents/calls?agent=John%20Doe&limit=5&offset=0" | jq '.'

# Response:
# {
#   "ok": true,
#   "summary": {
#     "totalAgents": 42,
#     "totalCalls": 1530,
#     "avgCallsPerAgent": 36
#   },
#   "rows": [
#     {
#       "agent": "Jane Doe",
#       "agent_id": "uuid-here",
#       "calls": 123,
#       "avgDurationSec": 164,
#       "completedRate": 0.62,
#       "totalDurationMin": 336,
#       "lastCall": "2025-09-14T10:30:00Z"
#     }
#   ],
#   "total": 42,
#   "limit": 10,
#   "offset": 0
# }
```

### Health Check

```bash
# Check ingest endpoint status
curl -s "$APP_URL/api/integrations/convoso/ingest" | jq '.'

# Response:
# {
#   "ok": true,
#   "status": "ready",
#   "circuit": {
#     "state": "closed",
#     "failures": 0,
#     "lastFailure": null,
#     "successCount": 0
#   },
#   "env": {
#     "hasAuthToken": true,
#     "baseUrl": "https://api.convoso.com/v1"
#   }
# }
```

### Refresh Materialized Views

```bash
# Refresh agent performance data (admin only)
curl -s -X POST "$APP_URL/api/ui/agents/calls/refresh" \
  -H "x-jobs-secret: $JOBS_SECRET" | jq '.'
```

## Testing

### Run Smoke Tests

```bash
# Set environment variables
export APP_URL=https://your-app.vercel.app
export JOBS_SECRET=your-jobs-secret

# Run smoke tests
node scripts/smoke/convoso.mjs
```

### Manual Testing Steps

1. **Test Authentication:**
   ```bash
   # Should return 401
   curl -X POST "$APP_URL/api/integrations/convoso/ingest" \
     -H "x-jobs-secret: wrong-secret" \
     -H "content-type: application/json" \
     -d '{"pages":1}'
   ```

2. **Test Small Ingest:**
   ```bash
   # Ingest 10 records
   curl -X POST "$APP_URL/api/integrations/convoso/ingest" \
     -H "x-jobs-secret: $JOBS_SECRET" \
     -H "content-type: application/json" \
     -d '{"pages":1,"perPage":10}'
   ```

3. **Verify Data:**
   ```bash
   # Check agent summary
   curl "$APP_URL/api/ui/agents/calls?limit=5&offset=0"
   ```