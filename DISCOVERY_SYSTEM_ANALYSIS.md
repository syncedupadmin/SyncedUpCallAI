# Discovery System - Comprehensive Technical Analysis

**Generated:** October 2, 2025
**Issue:** Discovery worked on first run, failed on second run (only 19/1000 calls completed)
**Root Cause:** 953 out of 1000 calls don't have recording URLs from Convoso API

---

## Executive Summary

The discovery system successfully completed on the first test but failed on the second attempt with only 19 successful transcriptions out of 5,000 queued calls. The primary failure reason was **"No recording URL available"** (953 failures out of 970 total failures).

**Critical Finding:** The Convoso API is NOT returning recording URLs for 95.3% of calls, despite the `include_recordings=1` parameter being set. This suggests either:
1. Convoso's API is not returning recording data as expected
2. The recording field structure from Convoso has changed
3. Most calls genuinely don't have recordings stored in Convoso
4. There's a time delay before recordings become available

---

## System Architecture Overview

### 1. Discovery Flow - Step by Step

```
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 1: FRONTEND - Discovery Wizard                            │
├─────────────────────────────────────────────────────────────────┤
│ Location: src/app/dashboard/discovery/page.tsx                  │
│                                                                  │
│ Step 1: Auth Token Validation                                   │
│   ↓ POST /api/discovery/start (validate_only=true)             │
│   ↓ Validates token with Convoso log/retrieve endpoint         │
│   ↓ Checks data availability (checkConvosoDataAvailability)     │
│   ↓ Stores encrypted credentials in agencies.convoso_credentials│
│                                                                  │
│ Step 2: Agent Selection                                         │
│   ↓ GET /api/discovery/get-agents                              │
│   ↓ Fetches from Convoso agent-performance/search              │
│   ↓ Filters agents with 5+ human_answered calls                │
│   ↓ User selects which agents to include                        │
│                                                                  │
│ Step 3: Start Discovery                                         │
│   ↓ POST /api/discovery/start (selected_agent_ids)             │
│   ↓ Creates discovery_sessions record (status='initializing')   │
│   ↓ Returns immediately with sessionId                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 2: BACKEND - Call Fetching (Background Job)               │
├─────────────────────────────────────────────────────────────────┤
│ Location: src/app/api/cron/process-discovery-queue/route.ts     │
│           src/app/api/discovery/queue-calls/route.ts            │
│           src/lib/discovery/processor.ts                         │
│                                                                  │
│ Trigger: Cron detects session with status='initializing'        │
│   ↓ POST /api/discovery/queue-calls                            │
│   ↓ fetchCallsInChunks() - Fetches calls from Convoso           │
│   ↓   - Endpoint: /log/retrieve?include_recordings=1            │
│   ↓   - Date range: Last 30 days                                │
│   ↓   - Limit: 1000 per page, paginated with offset             │
│   ↓   - Filters: call_length >= 10 seconds                      │
│   ↓   - Extracts recording_url from response                     │
│   ↓                                                              │
│   ↓ Recording URL Extraction Logic:                             │
│   ↓   recording_url = call.recording?.[0]?.public_url ||        │
│   ↓                   call.recording?.[0]?.src ||                │
│   ↓                   null                                       │
│   ↓                                                              │
│   ↓ Batch insert into discovery_calls table (1000 per batch)   │
│   ↓ Updates session status to 'queued'                          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 3: BACKEND - Call Processing (Cron Every Minute)          │
├─────────────────────────────────────────────────────────────────┤
│ Location: src/app/api/cron/process-discovery-queue/route.ts     │
│                                                                  │
│ For each session with status='queued' or 'processing':          │
│                                                                  │
│ 1. Fetch 300 pending calls WITH recording_url (line 126)       │
│    ↓ SELECT * FROM discovery_calls                              │
│    ↓   WHERE session_id = ? AND processing_status = 'pending'  │
│    ↓   AND recording_url IS NOT NULL                            │
│    ↓   LIMIT 300                                                 │
│                                                                  │
│ 2. Process in batches of 75 (75% of Deepgram's 100 limit)      │
│    ↓ For each call in batch:                                    │
│    ↓   a. Transcribe with Deepgram/AssemblyAI                   │
│    ↓   b. Analyze with OpenAI GPT-4o-mini (2-pass)             │
│    ↓   c. Store results in discovery_calls                      │
│                                                                  │
│ 3. Mark calls without recording_url as failed (line 140-149)   │
│    ↓ UPDATE discovery_calls SET processing_status = 'failed',   │
│    ↓   error_message = 'No recording URL available'             │
│    ↓   WHERE recording_url IS NULL                              │
│                                                                  │
│ 4. Finalize when no pending calls remain                        │
│    ↓ Check if completedCount >= 100 (line 413)                 │
│    ↓   YES: Calculate metrics, mark session 'complete'          │
│    ↓   NO:  Mark session 'error' with message                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key Files and Their Roles

### Frontend Components

**`src/app/dashboard/discovery/page.tsx`** (602 lines)
- Discovery wizard UI with 3 steps: auth, agents, confirm
- Handles auth token validation and agent selection
- Starts discovery by creating session record
- **No agent filtering** - ignores selectedAgents parameter (line 279 comment)

**`src/app/dashboard/discovery/results/page.tsx`**
- Real-time progress monitoring
- Displays discovery metrics as calls are processed

### API Endpoints

**`src/app/api/discovery/start/route.ts`** (194 lines)
- **Mode 1:** Validate credentials (`validate_only=true`)
  - Tests auth token with Convoso
  - Checks data availability
  - Stores encrypted credentials
- **Mode 2:** Start discovery (`selected_agent_ids`)
  - Creates discovery_sessions record
  - Returns immediately (no blocking fetch)
  - Cron will detect and process

**`src/app/api/discovery/queue-calls/route.ts`** (179 lines)
- Background job to fetch calls from Convoso
- Called by cron when session status='initializing'
- Uses `fetchCallsInChunks()` from processor
- Batch inserts into discovery_calls table

**`src/app/api/discovery/get-agents/route.ts`** (125 lines)
- Fetches agents from Convoso agent-performance/search
- Filters agents with 5+ human_answered calls
- Returns agent list for selection UI

**`src/app/api/cron/process-discovery-queue/route.ts`** (539 lines)
- **Main processing engine** - runs every minute
- Handles sessions with status: initializing, queued, processing
- Processes 300 calls per run, 75 concurrent
- **CRITICAL:** Only processes calls WITH recording_url (line 126)
- Marks calls without recording_url as failed (line 140-149)
- Finalizes session when done

### Core Libraries

**`src/lib/discovery/processor.ts`** (649 lines)
- `fetchCallsInChunks()` - Fetches calls from Convoso
  - Line 199: **Sets `include_recordings: '1'` parameter**
  - Line 233: **Extracts recording URL:**
    ```typescript
    recording_url: call.recording?.[0]?.public_url ||
                   call.recording?.[0]?.src ||
                   null
    ```
- `fetchRecordingUrl()` - Dynamic recording fetch (fallback)
- `checkConvosoDataAvailability()` - Pre-flight data check

**`src/lib/discovery/queue-processor.ts`** (13 lines)
- Re-exports from processor.ts for cron usage

---

## Recording URL Handling - The Critical Path

### Where Recording URLs Come From

There are TWO sources for recording URLs:

#### 1. **Bulk Fetch (Primary)** - `fetchCallsInChunks()`
```typescript
// Location: src/lib/discovery/processor.ts:160-288

const params = new URLSearchParams({
  auth_token: credentials.auth_token,
  start: dateStart,
  end: dateEnd,
  limit: String(1000),
  offset: String(offset),
  include_recordings: '1'  // ← REQUEST RECORDINGS
});

fetch(`${apiBase}/log/retrieve?${params.toString()}`)
  .then(data => {
    const recordings = data.data?.results || [];

    const validCalls = recordings
      .filter(call => call.call_length >= 10)
      .map(call => ({
        ...call,
        // ↓ EXTRACT RECORDING URL FROM RESPONSE
        recording_url: call.recording?.[0]?.public_url ||
                       call.recording?.[0]?.src ||
                       null
      }));
  });
```

**Expected Convoso Response Structure:**
```json
{
  "success": true,
  "data": {
    "results": [
      {
        "id": "362241655",
        "call_length": "45",
        "recording": [
          {
            "public_url": "https://...",
            "src": "https://..."
          }
        ]
      }
    ]
  }
}
```

#### 2. **Individual Fetch (Fallback)** - `fetchRecordingUrl()`
```typescript
// Location: src/lib/discovery/processor.ts:49-98

fetch(`${apiBase}/leads/get-recordings?auth_token=${...}&call_id=${...}&lead_id=${...}`)
  .then(data => {
    if (data.success && data.data?.entries?.length > 0) {
      return data.data.entries[0].url;
    }
  });
```

**This fallback is ONLY called if bulk fetch returned null** (line 282 in process-discovery-queue/route.ts)

---

## Current Problem Analysis

### Error Breakdown from Latest Session

```
Total calls queued: 1,000
Status breakdown:
  - Pending: 0
  - Processing: 26  (stuck)
  - Completed: 4
  - Failed: 970

Failure reasons:
  - "No recording URL available": 953 (98.2%)
  - "AssemblyAI transcription timeout": 11 (1.1%)
  - "AssemblyAI download error": 5 (0.5%)
  - "Transcription returned empty": 1 (0.1%)
```

### Root Cause Hypothesis

**The Convoso `/log/retrieve?include_recordings=1` endpoint is NOT returning recording URLs for 95.3% of calls.**

Possible reasons:
1. **API Breaking Change:** Convoso changed their response structure
2. **Parameter Ignored:** The `include_recordings=1` parameter is being ignored
3. **Delayed Availability:** Recordings not available yet (timing issue)
4. **Account Limitation:** Recording access restricted on this Convoso account
5. **Field Name Change:** Recording data exists but in a different field

### Why It Worked Once

**Two possibilities:**
1. **Different data set:** First test had calls with recordings, second didn't
2. **Timing:** First test was on older calls (recordings available), second was recent (not yet processed)
3. **Convoso API intermittent issue:** First call succeeded, second failed

---

## Data Flow Diagram

```
┌──────────────┐
│   Convoso    │
│  API Server  │
└──────┬───────┘
       │ include_recordings=1
       ↓
┌──────────────────────────────────────────┐
│ Response Structure (EXPECTED)             │
├──────────────────────────────────────────┤
│ {                                         │
│   "success": true,                        │
│   "data": {                               │
│     "results": [                          │
│       {                                   │
│         "id": "123",                      │
│         "call_length": "45",              │
│         "recording": [                    │  ← We extract from here
│           {                               │
│             "public_url": "https://...",  │  ← First choice
│             "src": "https://..."          │  ← Fallback
│           }                               │
│         ]                                 │
│       }                                   │
│     ]                                     │
│   }                                       │
│ }                                         │
└──────────────────────────────────────────┘
       ↓
┌──────────────────────────────────────────┐
│ discovery_calls Table                     │
├──────────────────────────────────────────┤
│ call_id | recording_url | status          │
│ 123     | https://...   | pending         │  ← HAS URL → processed
│ 456     | NULL          | pending         │  ← NO URL → fails
└──────────────────────────────────────────┘
       ↓                  ↓
    Process           Skip & Mark Failed
       ↓                  ↓
┌─────────────┐    ┌──────────────────┐
│ Transcribe  │    │ error_message:   │
│ + Analyze   │    │ "No recording    │
│ = Completed │    │  URL available"  │
└─────────────┘    └──────────────────┘
```

---

## Configuration Analysis

### Deepgram Settings
- **Model:** Nova-2 (standard)
- **Concurrency:** 75 parallel requests (75% of 100-request limit)
- **Batch size:** 300 calls per cron run
- **Rate:** ~250 calls/minute when recordings available

### Processing Quotas
- **Target:** 5,000 calls per discovery
- **Minimum success:** 100 calls (line 413 in finalization)
- **Success threshold:** 2% completion rate minimum

### Cron Schedule
```json
{
  "crons": [
    {
      "path": "/api/cron/process-discovery-queue",
      "schedule": "* * * * *"  // Every minute
    }
  ]
}
```

---

## Diagnostic Endpoints Created

To troubleshoot this issue, three diagnostic endpoints have been deployed:

### 1. `/api/debug/discovery-errors`
Returns detailed error analysis for latest session:
```json
{
  "session": { "id": "...", "status": "error", ... },
  "status_breakdown": {
    "pending": 0,
    "processing": 26,
    "completed": 4,
    "failed": 970
  },
  "top_errors": [
    { "error": "No recording URL available", "count": 953 },
    ...
  ],
  "sample_errors": [...]
}
```

### 2. `/api/debug/convoso-sample`
Inspects actual Convoso API response structure:
```json
{
  "total_calls": 10,
  "calls_with_recording_field": 2,
  "sample_analysis": [
    {
      "call_id": "123",
      "has_recording_field": true,
      "recording_type": "array",
      "recording_length": 1,
      "first_recording": {
        "keys": ["public_url", "src", ...],
        "has_public_url": true,
        "sample_url": "https://..."
      },
      "top_level_keys": ["recording", "audio_url", ...]
    }
  ],
  "raw_first_call": { ... }  // Full response
}
```

### 3. `/api/debug/compare-sessions`
Side-by-side comparison of last 3 sessions:
```json
{
  "sessions": [
    {
      "id": "...",
      "recording_availability": {
        "with_recordings": 47,
        "without_recordings": 953,
        "percentage_with_recordings": 5
      },
      "failure_breakdown": { ... }
    }
  ],
  "key_differences": [
    {
      "metric": "Recording Availability",
      "latest": "5% (47/1000)",
      "previous": "98% (4900/5000)",  // Example
      "difference": -93
    }
  ]
}
```

---

## Next Steps - Action Plan

### Immediate Actions

1. **Inspect Convoso Response Structure**
   ```
   Visit: /api/debug/convoso-sample
   ```
   This will reveal the ACTUAL structure of the recording field from Convoso.

2. **Compare Sessions**
   ```
   Visit: /api/debug/compare-sessions
   ```
   This will show the difference between working and failing sessions.

3. **Check Convoso Dashboard**
   - Login to Convoso admin panel
   - Verify that recordings exist for recent calls
   - Check if there's a delay in recording availability
   - Verify API access permissions for recordings

### Possible Fixes

#### If Response Structure Changed:
Update extraction logic in `src/lib/discovery/processor.ts:233`
```typescript
// Current:
recording_url: call.recording?.[0]?.public_url || call.recording?.[0]?.src || null

// Might need to change to:
recording_url: call.audio_url || call.recording_url || call.recording?.[0]?.public_url || null
```

#### If Recordings Aren't Available Immediately:
Add a delay/retry mechanism or fetch recordings in a separate pass after initial queue.

#### If Convoso Changed API Behavior:
Switch to using `/leads/get-recordings` for ALL calls instead of relying on `include_recordings=1`.

#### If Account Limitation:
Contact Convoso support to verify recording access permissions.

---

## Performance Metrics

### Current Configuration
- **Throughput:** 250 calls/minute (when recordings available)
- **Time to complete 5000 calls:** 18-22 minutes (if all recordings available)
- **Concurrent processing:** 75 Deepgram requests
- **Batch size:** 300 calls per cron run

### Bottlenecks
1. **Recording availability:** 95% failure rate due to missing URLs
2. **API response time:** Convoso /log/retrieve can be slow for large datasets
3. **Transcription timeouts:** AssemblyAI timeouts on 11 calls

---

## Code References

### Critical Line Numbers

| File | Line | Purpose |
|------|------|---------|
| `processor.ts` | 199 | Sets `include_recordings: '1'` parameter |
| `processor.ts` | 233 | Extracts recording_url from Convoso response |
| `queue-calls/route.ts` | 117 | Maps recording_url to discovery_calls |
| `process-discovery-queue/route.ts` | 126 | Queries only calls WITH recording_url |
| `process-discovery-queue/route.ts` | 140-149 | Marks calls without recording_url as failed |
| `process-discovery-queue/route.ts` | 282 | Fallback fetch if recording_url is null |
| `process-discovery-queue/route.ts` | 413 | Minimum 100 calls threshold for completion |

---

## Conclusion

The discovery system is architecturally sound but depends entirely on Convoso returning recording URLs via the `/log/retrieve?include_recordings=1` endpoint. The current failure (95.3% no recording URL) suggests either:

1. A Convoso API issue/change
2. A timing problem (recordings not yet available)
3. An account/permission limitation
4. A change in Convoso's response structure

**The diagnostic endpoints will reveal the exact cause.** Run them and share the results for immediate remediation.

---

**Report generated by:** Claude Code Analysis
**Status:** Diagnostic endpoints deployed, awaiting results
**Priority:** HIGH - System unusable without recording URLs
