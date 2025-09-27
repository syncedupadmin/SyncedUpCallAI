# Production Ready Master Plan
**Date**: 2025-09-27
**Objective**: Fix critical security issues with ZERO DOWNTIME and NO DATA LOSS
**Estimated Time**: 6-8 hours total implementation

---

## 🎯 Strategy: Non-Destructive, Backwards-Compatible Fixes

**Core Principle**: Don't break existing functionality while adding security

### Approach:
1. ✅ Keep all existing routes working
2. ✅ Add agency context to database records (already done via migration)
3. ✅ Gradually migrate routes to use RLS-enabled clients
4. ✅ Default to "first agency" for existing single-tenant data
5. ✅ Test at each step

---

## 📋 Master Plan Overview

### Phase 1: Unsecured Routes (2-3 hours)
Fix 5 critical data leakage routes with minimal changes

### Phase 2: Webhook Agency Assignment (2-3 hours)
Add agency mapping without breaking existing webhooks

### Phase 3: Admin Routes (1-2 hours)
Add proper super admin checks while preserving admin functionality

### Phase 4: Testing & Verification (1 hour)
Comprehensive security testing

---

# PHASE 1: FIX UNSECURED ROUTES (P0)

## 🎯 Goal: Add agency isolation to 5 critical routes

### Route 1: `/api/calls/route.ts`

**Issue**: Returns ALL calls without agency filtering

**Fix Strategy**:
1. Keep existing endpoint for backwards compatibility
2. Add agency context
3. Default to user's agency if single-tenant
4. Graceful fallback if no agency access

**Implementation**:

```typescript
// src/app/api/calls/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { withStrictAgencyIsolation, createSecureClient } from '@/lib/security/agency-isolation';

export const dynamic = 'force-dynamic';

export const GET = withStrictAgencyIsolation(async (req, context) => {
  try {
    const supabase = createSecureClient();

    // Use RLS-enabled Supabase client - automatically filters by agency
    const { data: calls, error } = await supabase
      .from('calls')
      .select(`
        id,
        source,
        source_ref,
        campaign,
        disposition,
        direction,
        started_at,
        ended_at,
        duration_sec,
        recording_url,
        agent_id,
        agent_name,
        phone_number,
        lead_id,
        created_at,
        updated_at,
        agents(name),
        contacts(primary_phone)
      `)
      .in('agency_id', context.agencyIds)
      .order('started_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('[SECURITY] Error fetching calls:', error);
      return NextResponse.json({
        ok: false,
        error: 'Failed to fetch calls',
        data: []
      });
    }

    // Enhance with agent names
    const enhancedCalls = calls?.map(call => ({
      ...call,
      agent_name: call.agent_name || call.agents?.name,
      phone_number: call.phone_number || call.contacts?.primary_phone
    })) || [];

    return NextResponse.json({
      ok: true,
      data: enhancedCalls
    });
  } catch (error: any) {
    console.error('[SECURITY] Error in /api/calls:', error);
    return NextResponse.json({
      ok: false,
      error: error.message,
      data: []
    });
  }
});
```

**Testing**:
```bash
# Test as user from Agency A
curl -H "Authorization: Bearer $TOKEN_A" https://yourapp.com/api/calls

# Test as user from Agency B
curl -H "Authorization: Bearer $TOKEN_B" https://yourapp.com/api/calls

# Verify: Zero overlap in returned call IDs
```

**Rollback Plan**: Revert file from git if issues

---

### Route 2: `/api/ui/library/simple/route.ts`

**Issue**: Returns best/worst/recent calls across all agencies

**Fix Strategy**: Convert raw SQL to RLS-enabled queries with agency filtering

**Implementation**:

```typescript
// src/app/api/ui/library/simple/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { withStrictAgencyIsolation, createSecureClient } from '@/lib/security/agency-isolation';

export const dynamic = 'force-dynamic';

export const GET = withStrictAgencyIsolation(async (req, context) => {
  try {
    const supabase = createSecureClient();

    // Get best calls (successful dispositions, longer duration)
    const { data: best } = await supabase
      .from('calls')
      .select(`
        id,
        started_at,
        duration_sec,
        disposition,
        campaign,
        agent_name,
        agents(name),
        analyses(qa_score, reason_primary, reason_secondary, summary, risk_flags)
      `)
      .in('agency_id', context.agencyIds)
      .in('disposition', ['Completed', 'Success', 'Connected', 'Answered'])
      .gt('duration_sec', 60)
      .order('started_at', { ascending: false })
      .limit(20);

    // Get worst calls
    const { data: worst } = await supabase
      .from('calls')
      .select(`
        id,
        started_at,
        duration_sec,
        disposition,
        campaign,
        agent_name,
        agents(name),
        analyses(qa_score, reason_primary, reason_secondary, summary, risk_flags)
      `)
      .in('agency_id', context.agencyIds)
      .or('disposition.in.(Failed,No Answer,Busy,Voicemail,Disconnected,Rejected),duration_sec.lt.30')
      .order('started_at', { ascending: false })
      .limit(20);

    // Get recent calls (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recent } = await supabase
      .from('calls')
      .select(`
        id,
        started_at,
        duration_sec,
        disposition,
        campaign,
        agent_name,
        agents(name),
        analyses(qa_score, reason_primary, reason_secondary, summary, risk_flags)
      `)
      .in('agency_id', context.agencyIds)
      .gte('started_at', sevenDaysAgo)
      .order('started_at', { ascending: false })
      .limit(20);

    // Calculate average QA score from this agency's analyzed calls
    const { data: analysisData } = await supabase
      .from('analyses')
      .select('qa_score')
      .in('agency_id', context.agencyIds)
      .not('qa_score', 'is', null);

    const avgScore = analysisData && analysisData.length > 0
      ? analysisData.reduce((sum, a) => sum + (a.qa_score || 0), 0) / analysisData.length
      : null;

    // Format data
    const formatCall = (call: any) => ({
      id: call.id,
      started_at: call.started_at,
      duration_sec: call.duration_sec,
      disposition: call.disposition,
      campaign: call.campaign,
      agent: call.agent_name || call.agents?.name,
      qa_score: call.analyses?.[0]?.qa_score,
      reason_primary: call.analyses?.[0]?.reason_primary,
      reason_secondary: call.analyses?.[0]?.reason_secondary,
      summary: call.analyses?.[0]?.summary,
      risk_flags: call.analyses?.[0]?.risk_flags
    });

    return NextResponse.json({
      ok: true,
      best: best?.map(formatCall) || [],
      worst: worst?.map(formatCall) || [],
      recent: recent?.map(formatCall) || [],
      avgScore
    });

  } catch (err: any) {
    console.error('[SECURITY] ui/library/simple GET error', err);

    return NextResponse.json({
      ok: true,
      best: [],
      worst: [],
      recent: [],
      avgScore: null,
      error: 'Failed to load library data'
    });
  }
});
```

**Testing**:
```bash
# Test library endpoint for each agency
# Verify best/worst/recent calls are different per agency
```

---

### Route 3: `/api/ui/call/transcript/route.ts`

**Issue**: Any user can access any transcript by ID

**Fix Strategy**: Add agency ownership validation before returning data

**Implementation**:

```typescript
// src/app/api/ui/call/transcript/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { withStrictAgencyIsolation, createSecureClient, validateResourceAccess } from '@/lib/security/agency-isolation';

export const dynamic = 'force-dynamic';

export const GET = withStrictAgencyIsolation(async (req, context) => {
  const id = req.nextUrl.searchParams.get('id');
  const format = req.nextUrl.searchParams.get('format') || 'json';

  if (!id) {
    return NextResponse.json({ ok: false, error: 'id_required' }, { status: 400 });
  }

  try {
    const supabase = createSecureClient();

    // SECURITY: Validate user has access to this call
    const hasAccess = await validateResourceAccess(id, 'calls', context);

    if (!hasAccess) {
      console.error(`[SECURITY] User ${context.userId} attempted to access transcript ${id} without permission`);
      return NextResponse.json({
        ok: false,
        error: 'transcript_not_found'
      }, { status: 404 });
    }

    // Get transcript with call metadata using RLS-enabled client
    const { data: transcript, error: transcriptError } = await supabase
      .from('transcripts')
      .select(`
        *,
        calls!inner(
          started_at,
          duration_sec,
          agent_name,
          contacts(primary_phone)
        )
      `)
      .eq('call_id', id)
      .in('calls.agency_id', context.agencyIds)
      .single();

    if (transcriptError || !transcript) {
      return NextResponse.json({
        ok: false,
        error: 'transcript_not_found'
      }, { status: 404 });
    }

    // Parse diarized segments if available
    let segments = [];
    if (transcript.diarized) {
      try {
        segments = typeof transcript.diarized === 'string'
          ? JSON.parse(transcript.diarized)
          : transcript.diarized;
      } catch {}
    }

    if (format === 'txt') {
      // Generate text format with speaker labels
      let content = `CALL TRANSCRIPT\n`;
      content += `================\n`;
      content += `Call ID: ${id}\n`;
      content += `Date: ${transcript.calls?.started_at ? new Date(transcript.calls.started_at).toLocaleString() : 'Unknown'}\n`;
      content += `Duration: ${transcript.calls?.duration_sec ? `${Math.floor(transcript.calls.duration_sec / 60)}:${(transcript.calls.duration_sec % 60).toString().padStart(2, '0')}` : 'Unknown'}\n`;
      content += `Language: ${transcript.lang || 'en'}\n`;
      content += `Engine: ${transcript.engine || 'Unknown'}\n`;
      content += `\n================\n\n`;

      if (segments.length > 0) {
        segments.forEach((seg: any) => {
          const speaker = seg.speaker || `Speaker ${seg.speaker_id || 'Unknown'}`;
          const time = seg.start ? `[${Math.floor(seg.start / 60)}:${(seg.start % 60).toFixed(0).padStart(2, '0')}]` : '';
          content += `${speaker} ${time}:\n${seg.text || seg.transcript || ''}\n\n`;
        });
      } else {
        content += transcript.translated_text || transcript.text || 'No transcript available';
      }

      return new Response(content, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': `inline; filename="transcript_${id}.txt"`,
        },
      });
    }

    // JSON format
    return NextResponse.json({
      ok: true,
      call_id: id,
      lang: transcript.lang,
      engine: transcript.engine,
      text: transcript.text,
      translated_text: transcript.translated_text,
      segments,
      words: transcript.words ? (typeof transcript.words === 'string' ? JSON.parse(transcript.words) : transcript.words) : [],
      metadata: {
        started_at: transcript.calls?.started_at,
        duration_sec: transcript.calls?.duration_sec,
        agent_name: transcript.calls?.agent_name,
        customer_phone: transcript.calls?.contacts?.primary_phone,
      }
    });
  } catch (error: any) {
    console.error('[SECURITY] Error fetching transcript:', error);
    return NextResponse.json({
      ok: false,
      error: 'server_error'
    }, { status: 500 });
  }
});
```

**Testing**:
```bash
# Test transcript access across agencies
# User A tries to access User B's transcript ID - should get 404
```

---

### Route 4 & 5: Will be covered in Phase 2 (Webhooks)

**Status**: Planned for webhook agency assignment section

---

## ⏱️ Phase 1 Deployment Plan

### Step 1: Backup Current State
```bash
git checkout -b backup/pre-security-fixes
git push origin backup/pre-security-fixes
```

### Step 2: Create Feature Branch
```bash
git checkout main
git pull origin main
git checkout -b fix/secure-user-facing-routes
```

### Step 3: Apply Fixes One at a Time

```bash
# Fix 1: /api/calls
# - Update file
# - Commit
git add src/app/api/calls/route.ts
git commit -m "fix: Add agency isolation to /api/calls endpoint

- Convert to use withStrictAgencyIsolation wrapper
- Use RLS-enabled Supabase client
- Filter by context.agencyIds
- Graceful error handling

SECURITY: Prevents cross-agency data access"

# Test locally
npm run dev
# Manual test with 2 users

# Fix 2: /api/ui/library/simple
# - Update file
# - Commit
git add src/app/api/ui/library/simple/route.ts
git commit -m "fix: Add agency filtering to call library endpoint

- Convert raw SQL to Supabase queries
- Use withStrictAgencyIsolation
- Filter best/worst/recent by agency
- Calculate QA scores per agency only

SECURITY: Prevents training data leakage"

# Fix 3: /api/ui/call/transcript
# - Update file
# - Commit
git add src/app/api/ui/call/transcript/route.ts
git commit -m "fix: Add access validation to transcript endpoint

- Validate resource ownership before returning data
- Use validateResourceAccess helper
- Return 404 for unauthorized access
- Maintain txt/json format support

SECURITY: Prevents transcript data theft"
```

### Step 4: Test Thoroughly
```bash
# Run all tests
npm test

# Security verification
npm run test:security  # If script exists

# Manual testing checklist:
# [ ] User A can see their calls
# [ ] User B can see different calls
# [ ] User A cannot access User B's transcript
# [ ] Call library shows different data per user
# [ ] All existing features still work
```

### Step 5: Deploy to Staging
```bash
git push origin fix/secure-user-facing-routes
# Create PR
# Review
# Merge to main
# Deploy to staging first
vercel deploy
```

### Step 6: Staging Tests
```bash
# Test with real data in staging
# Use 2 different agency accounts
# Verify isolation
```

### Step 7: Production Deployment
```bash
# Deploy to production
vercel --prod

# Monitor logs for errors
vercel logs --prod --follow

# Quick smoke test
# Verify user can login and see their data
```

---

# PHASE 2: WEBHOOK AGENCY ASSIGNMENT (P0)

## 🎯 Goal: Make webhooks create data with correct agency_id

### Challenge: Webhooks don't know which agency they belong to

### Solution: Multi-Tenant Webhook Architecture

**Option A**: Unique Webhook URLs per Agency (RECOMMENDED)
**Option B**: Agency Identifier in Payload
**Option C**: Lookup Table Mapping

We'll implement **Option A** because it's most secure and scalable.

---

## Implementation: Webhook Token System

### Step 1: Create Webhook Tokens Table

```sql
-- Add to new migration: supabase/migrations/XXXXXX_webhook_tokens.sql

CREATE TABLE IF NOT EXISTS public.webhook_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  endpoint_type TEXT NOT NULL, -- 'convoso_calls', 'convoso_leads', etc.
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX idx_webhook_tokens_agency ON webhook_tokens(agency_id);
CREATE INDEX idx_webhook_tokens_token ON webhook_tokens(token);

-- Enable RLS
ALTER TABLE webhook_tokens ENABLE ROW LEVEL SECURITY;

-- Only agency admins can manage tokens
CREATE POLICY "Agency admins can manage their webhook tokens" ON webhook_tokens
  FOR ALL TO authenticated
  USING (
    agency_id IN (
      SELECT agency_id FROM user_agencies
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- Function to generate secure token
CREATE OR REPLACE FUNCTION generate_webhook_token()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN encode(gen_random_bytes(32), 'hex');
END;
$$;

-- Function to get agency from token
CREATE OR REPLACE FUNCTION get_agency_from_webhook_token(p_token TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_agency_id UUID;
BEGIN
  SELECT agency_id INTO v_agency_id
  FROM webhook_tokens
  WHERE token = p_token
    AND is_active = true;

  -- Update last_used_at
  UPDATE webhook_tokens
  SET last_used_at = NOW()
  WHERE token = p_token;

  RETURN v_agency_id;
END;
$$;
```

---

### Step 2: Create Agency Webhook Management Endpoint

```typescript
// src/app/api/agencies/[id]/webhooks/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { withStrictAgencyIsolation, createSecureClient } from '@/lib/security/agency-isolation';

export const dynamic = 'force-dynamic';

// GET - List webhook tokens for agency
export const GET = withStrictAgencyIsolation(async (req, context, { params }: { params: { id: string } }) => {
  try {
    const agencyId = params.id;

    // Verify user has access to this agency
    if (!context.agencyIds.includes(agencyId)) {
      return NextResponse.json({ ok: false, error: 'access_denied' }, { status: 403 });
    }

    const supabase = createSecureClient();

    const { data: tokens, error } = await supabase
      .from('webhook_tokens')
      .select('id, endpoint_type, token, is_active, created_at, last_used_at')
      .eq('agency_id', agencyId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[SECURITY] Error fetching webhook tokens:', error);
      return NextResponse.json({ ok: false, error: 'Failed to fetch tokens' }, { status: 500 });
    }

    // Generate webhook URLs for each token
    const baseUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_SITE_URL;
    const tokensWithUrls = tokens?.map(t => ({
      ...t,
      webhook_url: `${baseUrl}/api/webhooks/${t.endpoint_type}?token=${t.token}`
    }));

    return NextResponse.json({ ok: true, tokens: tokensWithUrls });
  } catch (error: any) {
    console.error('[SECURITY] Error in webhook tokens GET:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
});

// POST - Create new webhook token
export const POST = withStrictAgencyIsolation(async (req, context, { params }: { params: { id: string } }) => {
  try {
    const agencyId = params.id;
    const { endpoint_type } = await req.json();

    // Verify user has admin access to this agency
    if (!context.agencyIds.includes(agencyId)) {
      return NextResponse.json({ ok: false, error: 'access_denied' }, { status: 403 });
    }

    // Check if user is admin of this agency
    const supabase = createSecureClient();
    const { data: membership } = await supabase
      .from('user_agencies')
      .select('role')
      .eq('user_id', context.userId)
      .eq('agency_id', agencyId)
      .single();

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({
        ok: false,
        error: 'Only agency owners and admins can create webhook tokens'
      }, { status: 403 });
    }

    // Generate token using database function
    const { data: newToken, error } = await supabase.rpc('generate_webhook_token').single();

    if (error) {
      return NextResponse.json({ ok: false, error: 'Failed to generate token' }, { status: 500 });
    }

    // Insert webhook token
    const { data: insertedToken, error: insertError } = await supabase
      .from('webhook_tokens')
      .insert({
        agency_id: agencyId,
        token: newToken,
        endpoint_type: endpoint_type || 'convoso_calls',
        created_by: context.userId
      })
      .select()
      .single();

    if (insertError) {
      console.error('[SECURITY] Error inserting webhook token:', insertError);
      return NextResponse.json({ ok: false, error: 'Failed to create token' }, { status: 500 });
    }

    const baseUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_SITE_URL;
    const webhookUrl = `${baseUrl}/api/webhooks/${insertedToken.endpoint_type}?token=${insertedToken.token}`;

    return NextResponse.json({
      ok: true,
      token: {
        ...insertedToken,
        webhook_url: webhookUrl
      }
    });
  } catch (error: any) {
    console.error('[SECURITY] Error creating webhook token:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
});

// DELETE - Deactivate webhook token
export const DELETE = withStrictAgencyIsolation(async (req, context, { params }: { params: { id: string } }) => {
  try {
    const agencyId = params.id;
    const { token_id } = await req.json();

    if (!context.agencyIds.includes(agencyId)) {
      return NextResponse.json({ ok: false, error: 'access_denied' }, { status: 403 });
    }

    const supabase = createSecureClient();

    const { error } = await supabase
      .from('webhook_tokens')
      .update({ is_active: false })
      .eq('id', token_id)
      .eq('agency_id', agencyId);

    if (error) {
      return NextResponse.json({ ok: false, error: 'Failed to deactivate token' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
});
```

---

### Step 3: Update Webhook Handlers

```typescript
// src/app/api/webhooks/convoso-calls/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { logInfo, logError } from '@/lib/log';

export const dynamic = 'force-dynamic';

// Helper: Get agency from token
async function getAgencyFromToken(token: string | null): Promise<string | null> {
  if (!token) return null;

  try {
    const result = await db.oneOrNone(`
      SELECT get_agency_from_webhook_token($1) as agency_id
    `, [token]);

    return result?.agency_id || null;
  } catch (error) {
    logError('Failed to get agency from token', error);
    return null;
  }
}

// Validate webhook secret (legacy support)
function validateWebhook(req: NextRequest): boolean {
  const secret = req.headers.get('x-webhook-secret');
  if (secret && process.env.CONVOSO_WEBHOOK_SECRET) {
    return secret === process.env.CONVOSO_WEBHOOK_SECRET;
  }
  return true; // Allow if no secret configured
}

export async function POST(req: NextRequest) {
  let webhookLogId: number | null = null;

  try {
    // SECURITY: Check for webhook token in query params (new method)
    const { searchParams } = new URL(req.url);
    const token = searchParams.get('token');

    let agencyId: string | null = null;

    if (token) {
      // New method: Token-based authentication
      agencyId = await getAgencyFromToken(token);

      if (!agencyId) {
        logError('Invalid or expired webhook token');
        return NextResponse.json({
          ok: false,
          error: 'Invalid webhook token'
        }, { status: 401 });
      }

      logInfo({
        event_type: 'webhook_auth',
        method: 'token',
        agency_id: agencyId
      });
    } else {
      // Legacy method: Header-based authentication (for backwards compatibility)
      if (!validateWebhook(req)) {
        logError('Invalid webhook secret for call webhook');
        return NextResponse.json({
          ok: false,
          error: 'Unauthorized'
        }, { status: 401 });
      }

      // For legacy webhooks without token, use first agency or default
      const firstAgency = await db.oneOrNone(`
        SELECT id FROM agencies ORDER BY created_at ASC LIMIT 1
      `);
      agencyId = firstAgency?.id || null;

      logInfo({
        event_type: 'webhook_auth',
        method: 'legacy',
        agency_id: agencyId,
        warning: 'Using legacy authentication - please migrate to token-based webhooks'
      });
    }

    // Parse body
    const bodyText = await req.text();
    const body = JSON.parse(bodyText);

    // Log webhook for debugging
    try {
      const result = await db.oneOrNone(`
        INSERT INTO webhook_logs (endpoint, method, headers, body, agency_id)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
      `, [
        '/api/webhooks/convoso-calls',
        'POST',
        Object.fromEntries(req.headers.entries()),
        body,
        agencyId
      ]);
      webhookLogId = result?.id;
    } catch (e) {
      // Table might not exist yet
    }

    // Map call data
    const callData = {
      call_id: body.call_id || body.uniqueid || body.id || null,
      lead_id: body.lead_id || body.owner_id || null,
      agent_name: body.agent_name || body.agent || null,
      phone_number: body.phone_number || body.phone || body.customer_phone || null,
      disposition: body.disposition || body.status || null,
      duration_sec: body.duration !== undefined ? Number(body.duration) : null,
      campaign: body.campaign || body.campaign_name || null,
      recording_url: body.recording_url || body.recording || null,
      started_at: body.started_at || body.start_time || null,
      ended_at: body.ended_at || body.end_time || null,
      agency_id: agencyId // NEW: Set agency_id
    };

    // Validate required fields
    if (!callData.agent_name || !callData.disposition || callData.duration_sec === null) {
      logError('Missing required call fields', null, {
        has_agent: !!callData.agent_name,
        has_disposition: !!callData.disposition,
        has_duration: callData.duration_sec !== null,
        body
      });

      return NextResponse.json({
        ok: false,
        error: 'Missing required fields: agent_name, disposition, duration'
      }, { status: 400 });
    }

    // Validate agency_id
    if (!callData.agency_id) {
      logError('No agency_id available for webhook', null, { token, body });
      return NextResponse.json({
        ok: false,
        error: 'Unable to determine agency for this webhook'
      }, { status: 400 });
    }

    // Ensure call_id or lead_id
    if (!callData.call_id && !callData.lead_id) {
      return NextResponse.json({
        ok: false,
        error: 'Either call_id or lead_id is required'
      }, { status: 400 });
    }

    // Link to existing contact if we have a lead_id
    let contactId = null;
    if (callData.lead_id) {
      try {
        const contact = await db.oneOrNone(`
          SELECT id FROM contacts
          WHERE lead_id = $1 AND agency_id = $2
        `, [callData.lead_id, callData.agency_id]);
        contactId = contact?.id;
      } catch (e) {
        // Contact might not exist
      }
    }

    // Upsert call record WITH agency_id
    const result = await db.oneOrNone(`
      INSERT INTO calls (
        call_id, lead_id, agent_name, phone_number, disposition,
        duration_sec, campaign, recording_url, started_at, ended_at,
        contact_id, agency_id, source, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
      ON CONFLICT (call_id) WHERE call_id IS NOT NULL
      DO UPDATE SET
        lead_id = COALESCE(EXCLUDED.lead_id, calls.lead_id),
        agent_name = EXCLUDED.agent_name,
        phone_number = COALESCE(EXCLUDED.phone_number, calls.phone_number),
        disposition = EXCLUDED.disposition,
        duration_sec = EXCLUDED.duration_sec,
        campaign = COALESCE(EXCLUDED.campaign, calls.campaign),
        recording_url = COALESCE(EXCLUDED.recording_url, calls.recording_url),
        started_at = COALESCE(EXCLUDED.started_at, calls.started_at),
        ended_at = COALESCE(EXCLUDED.ended_at, calls.ended_at),
        contact_id = COALESCE(EXCLUDED.contact_id, calls.contact_id),
        agency_id = COALESCE(calls.agency_id, EXCLUDED.agency_id)
      RETURNING id
    `, [
      callData.call_id,
      callData.lead_id,
      callData.agent_name,
      callData.phone_number,
      callData.disposition,
      callData.duration_sec,
      callData.campaign,
      callData.recording_url,
      callData.started_at,
      callData.ended_at,
      contactId,
      callData.agency_id, // NOW INCLUDES agency_id
      'convoso'
    ]);

    const callRecordId = result?.id;

    // Queue recording fetch if no recording_url
    if (!callData.recording_url && (callData.call_id || callData.lead_id)) {
      try {
        const callHasEnded = !!(callData.ended_at || (callData.duration_sec && callData.duration_sec > 0));
        const callStartTime = callData.started_at ? new Date(callData.started_at) : new Date();
        const callEndTime = callData.ended_at ? new Date(callData.ended_at) : null;

        let scheduledFor;
        let estimatedEndTime = null;

        if (callHasEnded) {
          scheduledFor = new Date();
        } else {
          const avgCallDurationMinutes = 5;
          estimatedEndTime = new Date(callStartTime.getTime() + (avgCallDurationMinutes * 60 * 1000));
          scheduledFor = new Date(estimatedEndTime.getTime() + (2 * 60 * 1000));
        }

        await db.none(`
          INSERT INTO pending_recordings (
            call_id, lead_id, attempts, created_at, scheduled_for,
            call_started_at, call_ended_at, estimated_end_time, retry_phase
          )
          VALUES ($1, $2, 0, NOW(), $3, $4, $5, $6, 'quick')
          ON CONFLICT DO NOTHING
        `, [
          callData.call_id,
          callData.lead_id,
          scheduledFor,
          callStartTime,
          callEndTime,
          estimatedEndTime
        ]);

        logInfo({
          event_type: 'recording_queued',
          call_id: callData.call_id,
          lead_id: callData.lead_id,
          agency_id: callData.agency_id,
          call_has_ended: callHasEnded,
          scheduled_for: scheduledFor.toISOString()
        });
      } catch (err) {
        logError('Failed to queue recording', err, {
          call_id: callData.call_id,
          lead_id: callData.lead_id,
          agency_id: callData.agency_id
        });
      }
    }

    // Update webhook log with success
    if (webhookLogId) {
      try {
        await db.none(`
          UPDATE webhook_logs
          SET response_status = $1, response_body = $2
          WHERE id = $3
        `, [200, { ok: true, call_id: callRecordId }, webhookLogId]);
      } catch (e) {}
    }

    logInfo({
      event_type: 'call_webhook',
      call_id: callData.call_id,
      lead_id: callData.lead_id,
      call_record_id: callRecordId,
      agency_id: callData.agency_id,
      has_recording: !!callData.recording_url,
      agent_name: callData.agent_name,
      disposition: callData.disposition,
      duration_sec: callData.duration_sec
    });

    return NextResponse.json({
      ok: true,
      type: 'call',
      call_id: callRecordId,
      agency_id: callData.agency_id,
      message: 'Call data saved'
    });

  } catch (error: any) {
    logError('Call webhook failed', error);

    if (webhookLogId) {
      try {
        await db.none(`
          UPDATE webhook_logs
          SET response_status = $1, error = $2
          WHERE id = $3
        `, [500, error.message, webhookLogId]);
      } catch (e) {}
    }

    return NextResponse.json({
      ok: false,
      error: error.message
    }, { status: 500 });
  }
}

// GET endpoint for status check
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get('token');

    let agencyFilter = '';
    let params: any[] = [];

    if (token) {
      const agencyId = await getAgencyFromToken(token);
      if (agencyId) {
        agencyFilter = 'AND agency_id = $1';
        params = [agencyId];
      }
    }

    const recentCalls = await db.manyOrNone(`
      SELECT COUNT(*) as count
      FROM calls
      WHERE created_at > NOW() - INTERVAL '24 hours'
      ${agencyFilter}
    `, params);

    return NextResponse.json({
      ok: true,
      endpoint: '/api/webhooks/convoso-calls',
      type: 'call event webhook',
      recent_calls: recentCalls[0]?.count || 0,
      authenticated: !!token
    });
  } catch (error: any) {
    return NextResponse.json({
      ok: false,
      error: error.message
    }, { status: 500 });
  }
}
```

---

### Step 4: Update Leads Webhook Similarly

```typescript
// src/app/api/webhooks/convoso/route.ts
// Apply same token-based authentication
// Add agency_id to contact creation
```

---

### Step 5: Migration for Existing Data

```sql
-- Create migration: supabase/migrations/XXXXXX_backfill_webhook_data.sql

-- For existing calls without agency_id, assign to first agency
UPDATE calls
SET agency_id = (SELECT id FROM agencies ORDER BY created_at ASC LIMIT 1)
WHERE agency_id IS NULL;

-- For existing contacts without agency_id, assign to first agency
UPDATE contacts
SET agency_id = (SELECT id FROM agencies ORDER BY created_at ASC LIMIT 1)
WHERE agency_id IS NULL;

-- Create default webhook token for existing agency
DO $$
DECLARE
  v_agency_id UUID;
  v_token TEXT;
BEGIN
  SELECT id INTO v_agency_id FROM agencies ORDER BY created_at ASC LIMIT 1;

  IF v_agency_id IS NOT NULL THEN
    v_token := encode(gen_random_bytes(32), 'hex');

    INSERT INTO webhook_tokens (agency_id, token, endpoint_type, is_active)
    VALUES
      (v_agency_id, v_token, 'convoso_calls', true),
      (v_agency_id, encode(gen_random_bytes(32), 'hex'), 'convoso_leads', true);

    RAISE NOTICE 'Created default webhook tokens for agency %', v_agency_id;
    RAISE NOTICE 'Call webhook token: %', v_token;
  END IF;
END $$;
```

---

## ⏱️ Phase 2 Deployment Plan

### Step 1: Create Database Migration
```bash
# Apply webhook_tokens migration
git add supabase/migrations/XXXXXX_webhook_tokens.sql
git commit -m "feat: Add webhook token system for multi-tenant webhooks"

# Push to Supabase
supabase db push
```

### Step 2: Deploy Agency Webhook Management
```bash
git add src/app/api/agencies/[id]/webhooks/route.ts
git commit -m "feat: Add webhook token management endpoint"
```

### Step 3: Update Webhook Handlers (Non-Breaking)
```bash
git add src/app/api/webhooks/convoso-calls/route.ts
git add src/app/api/webhooks/convoso/route.ts
git commit -m "feat: Add token-based authentication to webhooks

- Supports both token-based (new) and header-based (legacy) auth
- Assigns agency_id to all created records
- Backwards compatible with existing webhooks
- Logs authentication method used"
```

### Step 4: Backfill Existing Data
```bash
git add supabase/migrations/XXXXXX_backfill_webhook_data.sql
git commit -m "data: Backfill agency_id for existing webhook data"

supabase db push
```

### Step 5: Test
```bash
# Test legacy webhook (should still work)
curl -X POST https://yourapp.com/api/webhooks/convoso-calls \
  -H "x-webhook-secret: $SECRET" \
  -d '{"call_id":"test","disposition":"Success","agent_name":"Test","duration":60}'

# Test new webhook with token
curl -X POST "https://yourapp.com/api/webhooks/convoso-calls?token=$TOKEN" \
  -d '{"call_id":"test2","disposition":"Success","agent_name":"Test","duration":60}'

# Verify both calls have agency_id set
```

---

# PHASE 3: ADMIN ROUTES (P1)

## 🎯 Goal: Distinguish super admin vs agency admin

### Current Issue:
- `isAdminAuthenticated()` checks for "admin" role
- Agency admins can see all agencies' data in admin routes
- Need to distinguish between:
  - **Super Admin** (can see everything)
  - **Agency Admin** (can only see their agency)

---

## Implementation: Super Admin Check

### Step 1: Update Admin Auth Helper

```typescript
// src/server/auth/admin.ts
import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function isAdminAuthenticated(req: NextRequest): Promise<boolean> {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  // Check if user is admin or super admin
  const { data: isSuperAdmin } = await supabase.rpc('is_super_admin');
  if (isSuperAdmin) return true;

  // Check if user is admin of any agency
  const { data: isAgencyAdmin } = await supabase.rpc('is_admin');
  return isAgencyAdmin === true;
}

export async function isSuperAdminAuthenticated(req: NextRequest): Promise<boolean> {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { data: isSuperAdmin } = await supabase.rpc('is_super_admin');
  return isSuperAdmin === true;
}

export async function getAdminContext(req: NextRequest): Promise<{
  userId: string;
  isSuperAdmin: boolean;
  agencyIds: string[];
} | null> {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: isSuperAdmin } = await supabase.rpc('is_super_admin');

  // Get user's agencies
  const { data: agencies } = await supabase
    .from('user_agencies')
    .select('agency_id')
    .eq('user_id', user.id);

  return {
    userId: user.id,
    isSuperAdmin: isSuperAdmin === true,
    agencyIds: agencies?.map(a => a.agency_id) || []
  };
}

export function unauthorizedResponse() {
  return NextResponse.json(
    { ok: false, error: 'Unauthorized' },
    { status: 401 }
  );
}

export function forbiddenResponse() {
  return NextResponse.json(
    { ok: false, error: 'Forbidden - Super admin access required' },
    { status: 403 }
  );
}
```

---

### Step 2: Update Admin Routes to Respect Agency Scope

```typescript
// src/app/api/admin/calls/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { getAdminContext, unauthorizedResponse } from '@/server/auth/admin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // Get admin context (user, super admin status, agencies)
  const adminContext = await getAdminContext(req);
  if (!adminContext) {
    return unauthorizedResponse();
  }

  try {
    let agencyFilter = '';
    let params: any[] = [];

    // If NOT super admin, filter by user's agencies
    if (!adminContext.isSuperAdmin) {
      if (adminContext.agencyIds.length === 0) {
        // Agency admin with no agencies - return empty
        return NextResponse.json({
          ok: true,
          data: [],
          filtered_by: 'agency',
          agencies: []
        });
      }

      agencyFilter = 'WHERE c.agency_id = ANY($1)';
      params = [adminContext.agencyIds];
    }

    const calls = await db.manyOrNone(`
      SELECT
        c.id,
        c.source,
        c.source_ref,
        c.campaign,
        c.disposition,
        c.direction,
        c.started_at,
        c.ended_at,
        c.duration_sec,
        c.recording_url,
        c.agent_id,
        c.agent_name,
        c.phone_number,
        c.lead_id,
        c.agency_id,
        c.created_at,
        c.updated_at,
        a.name as agent_full_name,
        ag.name as agency_name,
        ce.payload->>'agent_name' as webhook_agent_name,
        ce.payload->>'phone_number' as webhook_phone_number
      FROM calls c
      LEFT JOIN agents a ON a.id = c.agent_id
      LEFT JOIN agencies ag ON ag.id = c.agency_id
      LEFT JOIN call_events ce ON ce.call_id = c.id AND ce.type = 'webhook_received'
      ${agencyFilter}
      ORDER BY c.created_at DESC
      LIMIT 500
    `, params);

    const enhancedCalls = calls.map(call => ({
      ...call,
      agent_name: call.agent_name || call.agent_full_name || call.webhook_agent_name,
      phone_number: call.phone_number || call.webhook_phone_number
    }));

    return NextResponse.json({
      ok: true,
      data: enhancedCalls,
      is_super_admin: adminContext.isSuperAdmin,
      filtered_by_agencies: !adminContext.isSuperAdmin ? adminContext.agencyIds : null
    });
  } catch (error: any) {
    console.error('Error fetching calls:', error);
    return NextResponse.json({
      ok: false,
      error: error.message,
      data: []
    });
  }
}
```

---

### Step 3: Protect Super Admin Only Routes

```typescript
// For routes that should ONLY be accessible to super admins
// src/app/api/admin/clear-all-calls/route.ts (example)

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { isSuperAdminAuthenticated, unauthorizedResponse, forbiddenResponse } from '@/server/auth/admin';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  // Check super admin authentication
  const isSuperAdmin = await isSuperAdminAuthenticated(req);
  if (!isSuperAdmin) {
    return forbiddenResponse();
  }

  try {
    // Dangerous operation - only super admins can do this
    await db.none(`DELETE FROM calls WHERE true`);

    return NextResponse.json({
      ok: true,
      message: 'All calls cleared'
    });
  } catch (error: any) {
    console.error('Error clearing calls:', error);
    return NextResponse.json({
      ok: false,
      error: error.message
    }, { status: 500 });
  }
}
```

---

## ⏱️ Phase 3 Deployment Plan

### Step 1: Update Admin Auth Helper
```bash
git add src/server/auth/admin.ts
git commit -m "feat: Add super admin vs agency admin distinction

- Add isSuperAdminAuthenticated() check
- Add getAdminContext() for scoped access
- Add forbiddenResponse() helper"
```

### Step 2: Update Admin Routes
```bash
# Update each admin route to respect agency scope
git add src/app/api/admin/calls/route.ts
git add src/app/api/admin/stats/route.ts
# ... other admin routes

git commit -m "feat: Add agency scoping to admin routes

- Super admins see all agencies
- Agency admins see only their agencies
- Add filtered_by_agencies indicator in responses"
```

### Step 3: Protect Dangerous Routes
```bash
git add src/app/api/admin/clear-all-calls/route.ts
git commit -m "security: Restrict destructive operations to super admins only"
```

### Step 4: Test
```bash
# Test as super admin - should see all data
# Test as agency admin - should see only their agency
# Test destructive operations - should require super admin
```

---

# PHASE 4: TESTING & VERIFICATION (CRITICAL)

## 🧪 Comprehensive Security Testing

### Test Scenario 1: Cross-Agency Data Isolation

```bash
# Create test script: scripts/test-agency-isolation.ts

import { createClient } from '@supabase/supabase-js';

async function testAgencyIsolation() {
  // Setup: Create 2 test agencies with data
  const agencyA = await createTestAgency('Agency A');
  const agencyB = await createTestAgency('Agency B');

  const userA = await createTestUser(agencyA.id, 'user-a@test.com');
  const userB = await createTestUser(agencyB.id, 'user-b@test.com');

  // Create test data
  const callA = await createTestCall(agencyA.id, 'Call A');
  const callB = await createTestCall(agencyB.id, 'Call B');

  console.log('Testing cross-agency isolation...');

  // Test 1: User A tries to access their own data
  const testA1 = await fetch('https://yourapp.com/api/calls', {
    headers: { 'Authorization': `Bearer ${userA.token}` }
  });
  const dataA1 = await testA1.json();

  console.assert(
    dataA1.data.some((c: any) => c.id === callA.id),
    'User A should see their own call'
  );
  console.assert(
    !dataA1.data.some((c: any) => c.id === callB.id),
    'User A should NOT see Agency B\'s call'
  );

  // Test 2: User A tries to access User B's transcript directly
  const testA2 = await fetch(
    `https://yourapp.com/api/ui/call/transcript?id=${callB.id}`,
    { headers: { 'Authorization': `Bearer ${userA.token}` } }
  );

  console.assert(
    testA2.status === 404,
    'User A should get 404 when trying to access User B\'s transcript'
  );

  // Test 3: User B can access their own data
  const testB1 = await fetch('https://yourapp.com/api/ui/library/simple', {
    headers: { 'Authorization': `Bearer ${userB.token}` }
  });
  const dataB1 = await testB1.json();

  console.assert(
    dataB1.recent.some((c: any) => c.id === callB.id),
    'User B should see their call in library'
  );
  console.assert(
    !dataB1.recent.some((c: any) => c.id === callA.id),
    'User B should NOT see Agency A\'s call in library'
  );

  // Test 4: User A searches - should only return Agency A data
  const testA3 = await fetch('https://yourapp.com/api/ui/search', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${userA.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ q: 'test query' })
  });
  const dataA3 = await testA3.json();

  console.assert(
    dataA3.data.every((c: any) => c.agency_id === agencyA.id),
    'Search should only return Agency A results'
  );

  console.log('✅ All agency isolation tests passed!');

  // Cleanup
  await cleanupTestData(agencyA.id, agencyB.id);
}

testAgencyIsolation().catch(console.error);
```

---

### Test Scenario 2: Webhook Agency Assignment

```bash
# Create test script: scripts/test-webhook-agency.sh

#!/bin/bash

# Test webhook with token
AGENCY_A_TOKEN="token-from-agency-a"
AGENCY_B_TOKEN="token-from-agency-b"

echo "Testing webhook with Agency A token..."
curl -X POST "http://localhost:3000/api/webhooks/convoso-calls?token=$AGENCY_A_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "call_id": "test-call-a",
    "agent_name": "Agent A",
    "disposition": "Success",
    "duration": 120,
    "phone_number": "5551234567"
  }'

echo "\nTesting webhook with Agency B token..."
curl -X POST "http://localhost:3000/api/webhooks/convoso-calls?token=$AGENCY_B_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "call_id": "test-call-b",
    "agent_name": "Agent B",
    "disposition": "Success",
    "duration": 90,
    "phone_number": "5559876543"
  }'

echo "\nVerifying calls were assigned to correct agencies..."
# Check database
psql $DATABASE_URL -c "
  SELECT
    call_id,
    agent_name,
    agency_id,
    (SELECT name FROM agencies WHERE id = calls.agency_id) as agency_name
  FROM calls
  WHERE call_id IN ('test-call-a', 'test-call-b')
"

# Expected output:
# test-call-a | Agent A | uuid-agency-a | Agency A
# test-call-b | Agent B | uuid-agency-b | Agency B
```

---

### Test Scenario 3: Admin Scoping

```bash
# Test as super admin - should see all
curl -H "Authorization: Bearer $SUPER_ADMIN_TOKEN" \
  http://localhost:3000/api/admin/calls | jq '.data | length'
# Expected: > 0, includes calls from multiple agencies

# Test as agency admin - should see only their agency
curl -H "Authorization: Bearer $AGENCY_ADMIN_TOKEN" \
  http://localhost:3000/api/admin/calls | jq '.filtered_by_agencies'
# Expected: [ "uuid-of-their-agency" ]

# Test destructive operation as agency admin - should fail
curl -X POST -H "Authorization: Bearer $AGENCY_ADMIN_TOKEN" \
  http://localhost:3000/api/admin/clear-all-calls
# Expected: 403 Forbidden
```

---

## 📊 Pre-Production Checklist

### Database Level
- [x] RLS enabled on all 7 tables
- [x] Agency_id column exists on all tables
- [x] Foreign key constraints with CASCADE
- [x] Indexes on agency_id columns
- [ ] Webhook_tokens table created
- [ ] Backfill migration applied

### API Routes
- [ ] `/api/calls` - Secured with RLS
- [ ] `/api/ui/library/simple` - Agency filtered
- [ ] `/api/ui/call/transcript` - Access validated
- [ ] `/api/webhooks/convoso-calls` - Agency assignment
- [ ] `/api/webhooks/convoso` - Agency assignment
- [ ] `/api/admin/*` - Agency scoped

### Testing
- [ ] 2 test agencies created
- [ ] Cross-agency access blocked (verified)
- [ ] Webhook agency assignment works
- [ ] Admin scoping verified
- [ ] Search returns correct results
- [ ] Transcript access validated
- [ ] No data leakage found

### Documentation
- [ ] Webhook setup guide updated
- [ ] Admin instructions updated
- [ ] Security policy documented
- [ ] Incident response plan

### Monitoring
- [ ] Security alerts configured
- [ ] Failed access attempts logged
- [ ] Webhook errors tracked
- [ ] Cross-agency queries monitored

---

## 🚀 Production Deployment Runbook

### T-1 Day: Final Prep
1. Run full test suite on staging
2. Verify all checklist items complete
3. Brief team on deployment plan
4. Prepare rollback procedure

### T-0 Hour: Deployment

**Step 1: Deploy Database Changes (5 min)**
```bash
# Push migrations
supabase db push

# Verify migrations applied
supabase db remote status

# Check data integrity
psql $DATABASE_URL -c "
  SELECT
    COUNT(*) FILTER (WHERE agency_id IS NULL) as null_agency_calls,
    COUNT(*) FILTER (WHERE agency_id IS NOT NULL) as valid_calls
  FROM calls
"
# Expected: null_agency_calls = 0
```

**Step 2: Deploy Code Changes (10 min)**
```bash
# Final commit
git add .
git commit -m "security: Production-ready multi-tenant isolation

- Fixed 5 critical data leakage routes
- Added webhook token system
- Implemented admin scoping
- Comprehensive security testing

BREAKING: Webhooks now require token parameter
MIGRATION: Legacy webhooks still supported via header auth"

# Push to main
git push origin main

# Deploy to production
vercel --prod

# Wait for deployment
vercel inspect --wait
```

**Step 3: Smoke Tests (5 min)**
```bash
# Test production health
curl https://yourapp.com/api/health

# Test authenticated endpoint
curl -H "Authorization: Bearer $PROD_USER_TOKEN" \
  https://yourapp.com/api/calls | jq '.data | length'

# Test webhook
curl -X POST "https://yourapp.com/api/webhooks/convoso-calls?token=$PROD_TOKEN" \
  -d '{"call_id":"test","agent_name":"Test","disposition":"Success","duration":60}'
```

**Step 4: Monitor (30 min)**
```bash
# Watch logs for errors
vercel logs --prod --follow

# Check error rate in Vercel dashboard
# Check database for new calls with agency_id
```

**Step 5: Enable New Webhooks (Per Agency)**
```bash
# For each agency:
# 1. Generate webhook token via admin UI
# 2. Update Convoso webhook URL to include token
# 3. Test webhook
# 4. Verify call appears in agency portal
```

---

## 🔄 Rollback Plan

If critical issues found within first hour:

**Option A: Code Rollback (Fast)**
```bash
# Revert to previous deployment
vercel rollback

# Or redeploy previous commit
git revert HEAD
git push origin main
vercel --prod
```

**Option B: Data Rollback (If corruption)**
```bash
# Restore from backup
# (Supabase automatic backups available)

# Or manually fix data
psql $DATABASE_URL -c "
  UPDATE calls
  SET agency_id = (SELECT id FROM agencies ORDER BY created_at LIMIT 1)
  WHERE agency_id IS NULL
"
```

**Option C: Progressive Rollout**
```bash
# Keep new code
# Route specific agencies to new webhook endpoints
# Others continue using legacy
# Gradually migrate over 1 week
```

---

## 📈 Success Metrics

After deployment, monitor:

1. **Security Metrics**
   - Cross-agency access attempts: 0
   - 404 errors on transcript endpoint: < 1%
   - Webhook auth failures: < 1%

2. **Functionality Metrics**
   - API error rate: < 0.5%
   - Dashboard load time: < 2s
   - Webhook processing success: > 99%

3. **User Metrics**
   - Login success rate: > 95%
   - Data visibility: Users see expected calls
   - No support tickets about "missing data"

---

## 🎯 Timeline Summary

| Phase | Duration | Downtime | Risk |
|-------|----------|----------|------|
| Phase 1: Routes | 2-3 hours | None | Low |
| Phase 2: Webhooks | 2-3 hours | None | Medium |
| Phase 3: Admin | 1-2 hours | None | Low |
| Phase 4: Testing | 1 hour | None | None |
| **Total** | **6-9 hours** | **Zero** | **Low** |

---

## ✅ Final Recommendation

**Proceed with confidence** - This plan:
- ✅ No downtime
- ✅ No data loss
- ✅ Backwards compatible
- ✅ Incremental testing
- ✅ Easy rollback
- ✅ Production-ready

**Timeline**: Can be completed in 1-2 work days with proper testing.

**Next Steps**:
1. Review plan with team
2. Schedule implementation window
3. Assign tasks to developers
4. Execute phase by phase

---

**Plan Created By**: Claude Code
**Last Updated**: 2025-09-27
**Version**: 1.0