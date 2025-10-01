# Discovery Flow - Complete Breakdown

## Current Setup (After Latest Changes)

### Phase 1: Pull Call Metadata (0-30% progress)
**File**: `src/lib/discovery/processor.ts` → `fetchCallsInChunks()`
**Endpoint**: `/log/retrieve` (Convoso API)

```
For each selected agent:
  For each date chunk (6 chunks of 5 days):
    → Fetch calls from /log/retrieve
    → Filter to 10+ seconds using call_length field
    → Store call metadata (id, lead_id, user_id, status, call_length, etc.)
```

**Status Updates**: `status: 'pulling'`, `progress: 0-30%`

---

### Phase 2: Fetch Recordings & Transcribe (30-70% progress)
**File**: `src/lib/discovery/processor.ts` → `fetchCallsInChunks()` (Step 5)
**Batch Size**: 20 calls processed in parallel

#### For each batch of 20 calls:

**2A. Fetch Recording URL**
- **Function**: `fetchRecordingUrl(callId, leadId, credentials)`
- **Endpoint**: `/leads/get-recordings?call_id=X&lead_id=Y&auth_token=Z`
- **Returns**: Recording URL (e.g., `https://convoso.s3.amazonaws.com/...`)

**2B. Transcribe with Deepgram**
- **Function**: `transcribe(recordingUrl)` from `@/server/asr`
- **File**: `src/server/asr/index.ts` → `src/server/asr/deepgram.ts`
- **Endpoint**: Deepgram API `/v1/listen`
- **Returns**: 
  ```typescript
  {
    engine: 'deepgram',
    lang: 'en',
    text: 'raw transcript...',
    translated_text: 'english translation if needed',
    diarized: [...], // speaker-separated
    words: [...]     // word-level timing
  }
  ```

**2C. Attach Transcript**
- Merge transcript into call object:
  ```typescript
  {
    ...call,
    recording_url,
    transcript: asrResult.translated_text || asrResult.text,
    duration_sec: parseInt(call.call_length),
    disposition: call.status
  }
  ```

**Status Updates**: `status: 'transcribing'`, `progress: 30-70%`

---

### Phase 3: Analyze with Discovery Engine (70-100% progress)
**File**: `src/lib/discovery/processor.ts` → `analyzeBatch()`
**Processing**: Batches of 50 calls sequentially

#### Current Analysis (Pattern Matching Only - NO OPENAI!)

For each call with transcript:

**3A. Opening Analysis**
- **Function**: `analyzeOpening(transcript, duration)`  
- **File**: `src/lib/discovery-engine.ts`
- **Method**: Pattern matching (NOT OpenAI)
- **Returns**: `{ score: 0-100 }`

**3B. Rebuttal Analysis**
- **Function**: `analyzeRebuttals(transcript)`
- **File**: `src/lib/discovery-engine.ts`
- **Method**: Pattern matching for stall types
- **Returns**: `{ gave_up_count }`

**3C. Lying Detection**
- **Function**: `detectLyingInTranscript(transcript)`
- **Method**: Pattern matching for LYING_PATTERNS
- **Returns**: `boolean`

**Status Updates**: `status: 'analyzing'`, `progress: 70-100%`

---

## ⚠️ CRITICAL ISSUE: NO OPENAI 2-PASS ANALYSIS!

### What's Missing
Discovery does **NOT** call OpenAI for 2-pass analysis. It only uses simple pattern matching.

### Normal Operations Flow (For Comparison)
**File**: `src/app/api/jobs/transcribe/route.ts` → `src/app/api/jobs/analyze/route.ts`

After Deepgram transcription:
1. Calls `/api/jobs/analyze` with callId
2. **OpenAI First Pass**: Calls `gpt-4o-mini` with ANALYSIS_SYSTEM prompt
3. Returns structured JSON: outcome, premium, enrollment_fee, policy_details, red_flags
4. Validates with JSON schema
5. Falls back to Claude if OpenAI fails
6. Stores in `analyses` table

### What Discovery Should Do
After getting transcripts (Phase 2), Discovery should:
1. Call `/api/jobs/analyze` for each call (like normal operations)
2. Wait for OpenAI 2-pass analysis to complete
3. Use analysis results for metrics

---

## API Usage Breakdown

### Convoso API Calls
- **Per Discovery Session**: ~1,000 calls
  - `/log/retrieve`: ~500 calls (6 chunks × 83 agents)
  - `/leads/get-recordings`: 2,500 calls (one per call)

### Deepgram API Calls
- **Per Discovery Session**: 2,500 transcriptions
- **Batch Size**: 20 parallel
- **Total Batches**: 125 batches
- **Rate Limit**: 100-200 concurrent (should be fine)

### OpenAI API Calls (IF WE ADD IT)
- **Per Discovery Session**: 2,500 analyses
- **Batch Size**: Currently would be sequential (SLOW)
- **Rate Limit**: Tier 1 = 500 RPM, Tier 2 = 5,000 RPM

---

## Timing Estimates

### Current (Without OpenAI)
- **Phase 1 (Pull)**: 1-2 minutes
- **Phase 2 (Transcribe)**: 3-4 minutes (2,500 calls ÷ 125 batches × 3s/batch)
- **Phase 3 (Pattern Analysis)**: 10-20 seconds
- **Total**: ~5-6 minutes ✅

### If We Add OpenAI 2-Pass
- **Phase 1 (Pull)**: 1-2 minutes
- **Phase 2 (Transcribe)**: 3-4 minutes
- **Phase 3 (OpenAI Analysis)**:
  - Sequential: 2,500 calls × 2s = 83 minutes ❌ (TOO SLOW)
  - Batch 50: 2,500 ÷ 50 × 2s = 100 seconds ✅ (if Tier 2+)
  - Batch 10: 2,500 ÷ 10 × 2s = 500 seconds ❌ (8+ minutes, timeout)
- **Total with Batch 50**: ~6-7 minutes ✅

---

## Recommendations

### Option 1: Keep Pattern Matching Only (Current)
✅ Fast (5-6 minutes)
✅ Within timeout
❌ Less accurate
❌ Missing: outcome, premium, policy details, red flags

### Option 2: Add OpenAI Analysis in Batches
✅ Accurate (same as normal operations)
✅ Gets full analysis data
⚠️ Requires Tier 2+ OpenAI (5,000 RPM)
⚠️ Adds 1-2 minutes to total time
❌ More expensive ($0.15-$0.30 per call × 2,500 = $375-$750)

### Option 3: Hybrid - Analyze Sample
✅ Fast
✅ Accurate for sampled calls
✅ Cheaper (analyze 500 calls instead of 2,500)
⚠️ Less comprehensive

---

## What You Asked For

> "make sure the discovery does the second pass with open ai"

**Answer**: It currently does NOT. Discovery uses pattern matching only.

**To Add It**: I would need to:
1. Import `/api/jobs/analyze` logic or call the endpoint
2. Process in batches of 50 (parallel)
3. Update `analyzeBatch()` to use OpenAI results instead of pattern matching
4. Add 1-2 minutes to total time
5. Verify you have OpenAI Tier 2+ (5,000 RPM limit)

Should I implement Option 2?
