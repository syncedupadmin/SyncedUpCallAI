# Phase 2: Webhook Agency Assignment - Design Document

**Date**: 2025-09-27
**Status**: 🎯 **IN PROGRESS**

---

## 🎯 Problem Statement

### Current Issues:
1. ❌ **`/api/webhooks/convoso`** - Creates contacts with NO `agency_id`
2. ❌ **`/api/webhooks/convoso-calls`** - Creates calls with NO `agency_id`
3. ❌ **`/api/webhooks/convoso-leads`** - Creates contacts with NO `agency_id`

### Impact:
- Webhooks from Agency B create data with NULL `agency_id`
- Data becomes orphaned (not visible to ANY agency)
- OR data gets assigned to wrong agency
- Breaks multi-tenant isolation completely

---

## 🏗️ Solution Design

### Architecture: Token-Based Agency Assignment

```
┌─────────────────────────────────────────────────────────────────┐
│ Convoso (Agency A's Account)                                    │
│ ├─ Webhook URL: https://app.com/api/webhooks/convoso-calls     │
│ └─ Header: X-Agency-Token: agt_abc123...                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Webhook Handler (/api/webhooks/convoso-calls)                   │
│ 1. Extract token from X-Agency-Token header                     │
│ 2. Look up agency_id from webhook_tokens table                  │
│ 3. Validate token is active                                     │
│ 4. Use agency_id for ALL data inserts                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Database: calls table                                            │
│ INSERT INTO calls (..., agency_id) VALUES (..., $agency_id)     │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📊 Database Schema

### New Table: `webhook_tokens`

```sql
CREATE TABLE webhook_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  name TEXT,                    -- User-friendly name (e.g., "Convoso Production")
  description TEXT,             -- Optional notes
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  last_used_at TIMESTAMPTZ,
  usage_count INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Indexes for performance
  CONSTRAINT webhook_tokens_pkey PRIMARY KEY (id),
  CONSTRAINT webhook_tokens_token_key UNIQUE (token),
  CONSTRAINT webhook_tokens_agency_fkey FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
);

CREATE INDEX idx_webhook_tokens_agency ON webhook_tokens(agency_id);
CREATE INDEX idx_webhook_tokens_token_active ON webhook_tokens(token) WHERE is_active = true;
CREATE INDEX idx_webhook_tokens_last_used ON webhook_tokens(last_used_at DESC);
```

### Token Format

```
agt_<32_random_hex_characters>
```

Example: `agt_4f2d8a6b1e9c7d3f5a8b2e1c6d9f4a7b`

- Prefix `agt_` = "agency token"
- 32 hex chars = 128 bits of entropy
- URL-safe, easy to identify

---

## 🔐 Security Model

### Token Generation
```typescript
import crypto from 'crypto';

function generateWebhookToken(): string {
  const randomBytes = crypto.randomBytes(16);
  const hexString = randomBytes.toString('hex');
  return `agt_${hexString}`;
}
```

### Token Validation Flow
```typescript
async function getAgencyFromWebhookToken(token: string): Promise<string | null> {
  if (!token || !token.startsWith('agt_')) {
    return null;
  }

  const result = await supabase
    .from('webhook_tokens')
    .select('agency_id, last_used_at, usage_count')
    .eq('token', token)
    .eq('is_active', true)
    .single();

  if (!result.data) {
    return null;
  }

  // Update usage stats (fire and forget)
  supabase
    .from('webhook_tokens')
    .update({
      last_used_at: new Date().toISOString(),
      usage_count: result.data.usage_count + 1
    })
    .eq('token', token)
    .then(() => {});

  return result.data.agency_id;
}
```

### Backward Compatibility

Support existing `X-Webhook-Secret` for transition period:

```typescript
async function getAgencyFromWebhook(req: NextRequest): Promise<string | null> {
  // NEW: Check for agency token first (preferred)
  const agencyToken = req.headers.get('x-agency-token');
  if (agencyToken) {
    const agencyId = await getAgencyFromWebhookToken(agencyToken);
    if (agencyId) {
      return agencyId;
    }
  }

  // FALLBACK: Check old webhook secret
  const oldSecret = req.headers.get('x-webhook-secret');
  if (oldSecret === process.env.CONVOSO_WEBHOOK_SECRET) {
    // Return default agency for backward compatibility
    // TODO: Remove this after all agencies migrate
    return process.env.DEFAULT_AGENCY_ID || null;
  }

  return null;
}
```

---

## 🛠️ API Endpoints

### 1. Create Webhook Token
```
POST /api/agencies/[agencyId]/webhooks
```

**Auth**: Requires agency owner or admin

**Request Body**:
```json
{
  "name": "Convoso Production",
  "description": "Main webhook for Convoso call events"
}
```

**Response**:
```json
{
  "ok": true,
  "token": {
    "id": "uuid",
    "token": "agt_4f2d8a6b1e9c7d3f5a8b2e1c6d9f4a7b",
    "name": "Convoso Production",
    "created_at": "2025-09-27T...",
    "webhook_url": "https://app.com/api/webhooks/convoso-calls"
  },
  "instructions": "Add this header to your Convoso webhook:\nX-Agency-Token: agt_4f2d..."
}
```

### 2. List Webhook Tokens
```
GET /api/agencies/[agencyId]/webhooks
```

**Auth**: Requires agency member

**Response**:
```json
{
  "ok": true,
  "tokens": [
    {
      "id": "uuid",
      "name": "Convoso Production",
      "description": "...",
      "created_at": "2025-09-27T...",
      "last_used_at": "2025-09-27T...",
      "usage_count": 1234,
      "is_active": true,
      "token_preview": "agt_4f2d...4a7b"  // First 8 + last 4 chars
    }
  ]
}
```

### 3. Revoke Webhook Token
```
DELETE /api/agencies/[agencyId]/webhooks/[tokenId]
```

**Auth**: Requires agency owner or admin

**Response**:
```json
{
  "ok": true,
  "message": "Token revoked successfully"
}
```

---

## 🔄 Webhook Handler Updates

### Updated Flow for `/api/webhooks/convoso-calls`

```typescript
export async function POST(req: NextRequest) {
  try {
    // 1. Get agency_id from token
    const agencyId = await getAgencyFromWebhook(req);

    if (!agencyId) {
      return NextResponse.json({
        ok: false,
        error: 'Invalid or missing webhook token'
      }, { status: 401 });
    }

    // 2. Parse call data
    const body = await req.json();
    const callData = { /* ... */ };

    // 3. Insert with agency_id
    await db.oneOrNone(`
      INSERT INTO calls (
        call_id, lead_id, agent_name, disposition,
        duration_sec, agency_id, source  -- ✅ Include agency_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ...
    `, [
      callData.call_id,
      callData.lead_id,
      callData.agent_name,
      callData.disposition,
      callData.duration_sec,
      agencyId,  // ✅ From token
      'convoso'
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
```

---

## 📝 Migration Plan

### Phase 2.1: Database Migration ✅
```sql
-- Create webhook_tokens table
-- Add indexes
-- Seed with default tokens for existing agencies
```

### Phase 2.2: Token Management API ✅
- Create `/api/agencies/[id]/webhooks` CRUD endpoints
- Protect with `withStrictAgencyIsolation`
- Test token generation and validation

### Phase 2.3: Update Webhook Handlers ✅
- Update `/api/webhooks/convoso`
- Update `/api/webhooks/convoso-calls`
- Update `/api/webhooks/convoso-leads`
- Add `agency_id` to all INSERT statements

### Phase 2.4: Testing ✅
- Create test tokens for 2 agencies
- Send webhooks with different tokens
- Verify data goes to correct agency
- Verify old secret still works (backward compat)

### Phase 2.5: Deployment
1. Deploy database migration
2. Deploy API changes
3. Create tokens for existing agencies
4. Update Convoso webhook configurations
5. Monitor webhook logs
6. After 30 days: Remove backward compatibility

---

## 🧪 Testing Strategy

### Unit Tests
```typescript
describe('getAgencyFromWebhookToken', () => {
  it('returns agency_id for valid token', async () => {
    const agencyId = await getAgencyFromWebhookToken('agt_valid...');
    expect(agencyId).toBe('uuid-of-agency');
  });

  it('returns null for invalid token', async () => {
    const agencyId = await getAgencyFromWebhookToken('agt_invalid...');
    expect(agencyId).toBeNull();
  });

  it('returns null for inactive token', async () => {
    const agencyId = await getAgencyFromWebhookToken('agt_inactive...');
    expect(agencyId).toBeNull();
  });
});
```

### Integration Tests
```bash
# Test 1: Create token for Agency A
POST /api/agencies/agency-a-id/webhooks
Authorization: Bearer <agency-a-admin-token>
{"name": "Test Token"}

# Test 2: Send webhook with Agency A token
POST /api/webhooks/convoso-calls
X-Agency-Token: agt_returned_from_test_1
{"call_id": "123", ...}

# Test 3: Verify call has Agency A's agency_id
SELECT agency_id FROM calls WHERE call_id = '123'
-- Should return agency-a-id

# Test 4: Send webhook with Agency B token
POST /api/webhooks/convoso-calls
X-Agency-Token: agt_agency_b_token
{"call_id": "456", ...}

# Test 5: Verify call has Agency B's agency_id
SELECT agency_id FROM calls WHERE call_id = '456'
-- Should return agency-b-id

# Test 6: Verify Agency A cannot see Agency B's call
GET /api/ui/calls
Authorization: Bearer <agency-a-user-token>
-- Should NOT include call 456
```

---

## 📊 Success Metrics

| Metric | Before | Target | Status |
|--------|--------|--------|--------|
| **Webhooks with agency_id** | 0% | 100% | Pending |
| **Orphaned webhook data** | 100% | 0% | Pending |
| **Token management UI** | None | Complete | Pending |
| **Backward compatibility** | N/A | 100% | Pending |
| **Test coverage** | 0% | 90%+ | Pending |

---

## 🚨 Risks & Mitigation

### Risk 1: Token Leakage
**Risk**: Tokens exposed in logs, screenshots, support tickets
**Mitigation**:
- Never log full tokens
- Show only preview in UI (first 8 + last 4)
- Rotate tokens regularly

### Risk 2: Backward Compatibility Break
**Risk**: Existing webhooks stop working
**Mitigation**:
- Support old secret during transition
- Phased rollout with monitoring
- Clear migration instructions

### Risk 3: Wrong Agency Assignment
**Risk**: Token used for wrong agency
**Mitigation**:
- Clear token naming in UI
- Show which agency token belongs to
- Audit trail of all webhook requests

---

## 📅 Timeline

| Task | Est. Time | Status |
|------|-----------|--------|
| Database migration | 15 min | Pending |
| Token management API | 45 min | Pending |
| Webhook handler updates | 60 min | Pending |
| Testing & verification | 30 min | Pending |
| **Total** | **2.5 hours** | **0% Complete** |

---

**Next Step**: Create database migration for `webhook_tokens` table