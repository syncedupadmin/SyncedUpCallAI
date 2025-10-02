# Call Processing & Analysis Guide

## Overview
SyncedUp Call AI processes calls through a multi-stage pipeline:
1. **Webhook Reception** → Receive call data from Convoso
2. **Recording Fetch** → Retrieve audio recordings
3. **Transcription** → Convert audio to text (Deepgram)
4. **Analysis** → Extract insights using AI (GPT-4/Claude)
5. **Display** → Show results in dashboard

## Quick Start: Process Calls

### Method 1: Automatic Processing (Recommended)
Calls are automatically processed when:
- Convoso sends webhook with call data
- Recording URL is available
- Call duration ≥ 10 seconds

### Method 2: Manual Processing via Dashboard
1. Go to https://synced-up-call-ai.vercel.app/dashboard
2. Find calls with status "Pending"
3. Click "Transcribe" button on individual calls
4. Wait for transcription and analysis to complete

### Method 3: Bulk Processing via API

## API Endpoints

### 1. Trigger Single Call Processing
```javascript
// Process a single call
async function processCall(callId) {
  const response = await fetch('https://synced-up-call-ai.vercel.app/api/ui/trigger/transcribe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${YOUR_AUTH_TOKEN}`
    },
    body: JSON.stringify({ call_id: callId })
  });

  const result = await response.json();
  console.log('Processing result:', result);
}
```

### 2. Batch Process Calls
Create a file `batch-process-calls.js`:

```javascript
#!/usr/bin/env node

const DATABASE_URL = process.env.DATABASE_URL;
const APP_URL = 'https://synced-up-call-ai.vercel.app';

async function getUnprocessedCalls() {
  // Fetch calls that need processing
  const response = await fetch(`${APP_URL}/api/admin/unprocessed-calls`, {
    headers: {
      'Authorization': `Bearer ${process.env.ADMIN_TOKEN}`
    }
  });
  return await response.json();
}

async function processCall(callId) {
  console.log(`Processing call ${callId}...`);

  try {
    const response = await fetch(`${APP_URL}/api/ui/trigger/transcribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.AUTH_TOKEN}`
      },
      body: JSON.stringify({ call_id: callId })
    });

    if (response.ok) {
      const result = await response.json();
      console.log(`✅ Call ${callId} processed successfully`);
      return result;
    } else {
      console.log(`❌ Failed to process call ${callId}: ${response.status}`);
      return null;
    }
  } catch (error) {
    console.log(`❌ Error processing call ${callId}:`, error.message);
    return null;
  }
}

async function batchProcess() {
  console.log('🚀 Starting batch call processing...');

  const { calls } = await getUnprocessedCalls();
  console.log(`Found ${calls.length} calls to process`);

  const results = {
    processed: 0,
    failed: 0,
    skipped: 0
  };

  // Process calls with rate limiting (2 calls per second)
  for (const call of calls) {
    // Check if call has recording
    if (!call.recording_url) {
      console.log(`⏭️ Skipping call ${call.id} - no recording`);
      results.skipped++;
      continue;
    }

    // Check duration
    if (call.duration < 10) {
      console.log(`⏭️ Skipping call ${call.id} - too short (${call.duration}s)`);
      results.skipped++;
      continue;
    }

    const result = await processCall(call.id);
    if (result) {
      results.processed++;
    } else {
      results.failed++;
    }

    // Rate limit: wait 500ms between calls
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n📊 Batch processing complete:');
  console.log(`   Processed: ${results.processed}`);
  console.log(`   Failed: ${results.failed}`);
  console.log(`   Skipped: ${results.skipped}`);
}

// Run batch processing
batchProcess().catch(console.error);
```

## Processing Pipeline Details

### Stage 1: Recording Fetch
- **Automatic**: Cron job runs every 5 minutes
- **Endpoint**: `/api/cron/process-recordings`
- **Process**:
  1. Checks `pending_recordings` table
  2. Fetches recording URLs from Convoso API
  3. Updates `calls` table with recording_url
  4. Retries up to 5 times with exponential backoff

### Stage 2: Transcription
- **Endpoint**: `/api/jobs/transcribe`
- **Engine**: Deepgram (fast, accurate)
- **Features**:
  - Speaker diarization
  - Word-level timestamps
  - Language detection
  - Auto-translation to English
- **Requirements**:
  - Call duration ≥ 10 seconds
  - Valid recording URL

### Stage 3: Analysis
- **Endpoint**: `/api/jobs/analyze`
- **AI Models**:
  - Primary: GPT-4o-mini
  - Fallback: Claude 3 Haiku
- **Extracts**:
  - Primary/secondary call reasons
  - QA score (0-100)
  - Script adherence
  - Customer/agent sentiment
  - Risk flags
  - Action items
  - Key quotes
  - Call summary

## Database Tables

### Key Tables for Call Processing:
```sql
-- Check unprocessed calls
SELECT
  c.id,
  c.call_id,
  c.lead_id,
  c.agent_name,
  c.duration,
  c.recording_url,
  c.created_at,
  CASE
    WHEN t.call_id IS NOT NULL THEN 'transcribed'
    WHEN c.recording_url IS NOT NULL THEN 'ready'
    ELSE 'pending_recording'
  END as status
FROM calls c
LEFT JOIN transcripts t ON t.call_id = c.id
WHERE c.duration >= 10
  AND t.call_id IS NULL
ORDER BY c.created_at DESC
LIMIT 100;

-- Check processing queue
SELECT
  pr.*,
  c.agent_name,
  c.duration
FROM pending_recordings pr
JOIN calls c ON c.id = pr.call_id
WHERE pr.processed = FALSE
ORDER BY pr.created_at DESC;

-- View analysis results
SELECT
  c.id,
  c.agent_name,
  c.duration,
  a.reason_primary,
  a.qa_score,
  a.sentiment_customer,
  a.summary
FROM calls c
JOIN analyses a ON a.call_id = c.id
ORDER BY c.created_at DESC
LIMIT 50;
```

## Manual Processing Script

Create `process-calls.sql` and run in Supabase:

```sql
-- Find calls that need processing
WITH unprocessed AS (
  SELECT
    c.id,
    c.call_id,
    c.lead_id,
    c.recording_url,
    c.duration
  FROM calls c
  LEFT JOIN transcripts t ON t.call_id = c.id
  WHERE c.duration >= 10
    AND c.recording_url IS NOT NULL
    AND t.call_id IS NULL
    AND c.created_at > NOW() - INTERVAL '7 days'
  LIMIT 10
)
SELECT * FROM unprocessed;

-- Queue calls for recording fetch (if no recording_url)
INSERT INTO pending_recordings (call_id, lead_id, attempts, created_at)
SELECT
  c.id,
  c.lead_id,
  0,
  NOW()
FROM calls c
LEFT JOIN pending_recordings pr ON pr.call_id = c.id
WHERE c.recording_url IS NULL
  AND c.lead_id IS NOT NULL
  AND pr.id IS NULL
  AND c.created_at > NOW() - INTERVAL '7 days'
LIMIT 100;
```

## Environment Variables Required

```env
# Transcription Service
DEEPGRAM_API_KEY=your-deepgram-key

# Analysis
OPENAI_API_KEY=your-openai-key

# Convoso Integration
CONVOSO_AUTH_TOKEN=your-convoso-token

# Internal
JOBS_SECRET=your-jobs-secret
APP_URL=https://synced-up-call-ai.vercel.app
```

## Monitoring & Troubleshooting

### Check Processing Status
```sql
-- Overall statistics
SELECT
  COUNT(*) as total_calls,
  COUNT(t.call_id) as transcribed,
  COUNT(a.call_id) as analyzed,
  COUNT(*) - COUNT(t.call_id) as pending_transcription
FROM calls c
LEFT JOIN transcripts t ON t.call_id = c.id
LEFT JOIN analyses a ON a.call_id = c.id
WHERE c.duration >= 10;

-- Recent processing errors
SELECT
  ce.call_id,
  ce.type,
  ce.payload,
  ce.at
FROM call_events ce
WHERE ce.type IN ('transcribe_error', 'analyze_error', 'embedding_error')
ORDER BY ce.at DESC
LIMIT 20;
```

### Common Issues & Solutions

1. **No recordings available**
   - Check Convoso webhook configuration
   - Verify CONVOSO_AUTH_TOKEN is set
   - Run recording fetch cron manually

2. **Transcription failures**
   - Check API key for Deepgram
   - Verify recording URLs are accessible
   - Check call duration (must be ≥ 10 seconds)

3. **Analysis not running**
   - Verify OpenAI API key
   - Check if transcript exists
   - Review call_events for errors

## Rate Limits

- **Transcription**: 5 concurrent calls
- **Analysis**: 10 calls per minute
- **Convoso API**: 100 requests per minute
- **Batch Processing**: 2 calls per second recommended

## Testing

Test individual call processing:
```bash
# Test with a specific call ID
curl -X POST https://synced-up-call-ai.vercel.app/api/ui/trigger/transcribe \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"call_id": "YOUR_CALL_ID"}'
```

## Next Steps

1. **Set up automatic processing**:
   - Configure Vercel cron jobs
   - Set up monitoring alerts

2. **Optimize performance**:
   - Enable parallel processing
   - Configure caching

3. **Monitor quality**:
   - Review QA scores
   - Check transcription accuracy
   - Validate analysis results