# SyncedUp Call AI - API Quota Resolution Guide

## Current Issue
The system is experiencing OpenAI API quota exhaustion (HTTP 429 errors), preventing:
- Transcript analysis (`/api/jobs/analyze`)
- Embedding generation (`/api/jobs/embed`)

## Status Summary

### Working Components ✅
- Database connection and schema
- Next.js application (running on port 3003)
- API endpoints structure and authentication
- Schema validation with soft fallback
- Transcript data available (1 transcript ready for processing)

### Blocked by API Quota ❌
- OpenAI GPT-4o-mini for analysis
- OpenAI text-embedding-3-small for embeddings
- No Anthropic API key configured as fallback

## Resolution Options

### Option 1: Add OpenAI Credits (Immediate Fix)
1. Go to https://platform.openai.com/account/billing
2. Add payment method and credits
3. System will immediately resume processing

### Option 2: Configure Anthropic Fallback
1. Get API key from https://console.anthropic.com
2. Add to `.env.local`:
   ```
   ANTHROPIC_API_KEY=your-anthropic-api-key
   ```
3. Restart the application
4. The analyze endpoint already has Anthropic fallback code implemented

### Option 3: Use Alternative Embedding Service
For embeddings, you could switch to:
- Cohere API
- HuggingFace Inference API
- Self-hosted model (e.g., sentence-transformers)

## Testing After Resolution

Run the verification script:
```bash
node verify_system.mjs
```

Test specific endpoints:
```bash
# Test embedding generation
curl -X POST http://localhost:3003/api/jobs/embed \
  -H "x-jobs-secret: dffrgvioervov554w8cwswiocvjsd" \
  -H "Content-Type: application/json" \
  -d '{"call_id":"161388cf-ebcc-43c6-9051-f375a5d13898"}'

# Test analysis
curl -X POST http://localhost:3003/api/jobs/analyze \
  -H "authorization: Bearer dffrgvioervov554w8cwswiocvjsd" \
  -H "Content-Type: application/json" \
  -d '{"callId":"161388cf-ebcc-43c6-9051-f375a5d13898"}'
```

## Implementation Details

### Code Changes Completed
1. **Schema Validation Relaxed** (`src/server/lib/json-guard.ts`)
   - Only requires `summary` field
   - Added soft validation fallback
   - Enhanced error logging

2. **Embed Endpoint Implemented** (`src/app/api/jobs/embed/route.ts`)
   - SHA256 hashing for cache
   - Checks `embeddings_meta` table
   - Stores in `transcript_embeddings` with pgvector
   - Returns appropriate status codes

3. **Analyze Endpoint Enhanced** (`src/app/api/jobs/analyze/route.ts`)
   - Debug logging with `DEBUG_ANALYSIS=1`
   - Anthropic fallback ready (needs API key)
   - Soft validation for partial responses

### Database Ready
- Tables created: `transcript_embeddings`, `embeddings_meta`
- 1 transcript available for processing (ID: 161388cf-ebcc-43c6-9051-f375a5d13898)
- pgvector extension enabled

## Expected Behavior After Fix
1. Embedding endpoint will generate 1536-dimension vectors
2. Analysis will produce call summaries and classifications
3. Both will store results in respective database tables
4. Cache will prevent duplicate processing

## Contact
For urgent resolution, consider:
- Checking OpenAI usage at https://platform.openai.com/usage
- Monitoring API status at https://status.openai.com