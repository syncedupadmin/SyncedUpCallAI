# SyncedUp Call AI - Test Pack

This directory contains scripts for testing and validating the SyncedUp Call AI system's real-time features, batch processing, and export functionality.

## Setup

1. Copy the environment template and configure it:
```bash
cp .env.example .env
# Edit .env with your actual values:
# - APP_URL: Your deployed app URL (e.g., https://synced-up-call-ai.vercel.app)
# - JOBS_SECRET: Your jobs API secret
# - WEBHOOK_SECRET: Your webhook authentication secret
```

2. Make scripts executable (Unix/Mac/Linux):
```bash
chmod +x *.sh
```

## Test Flow

### 1. Seed a Test Call

Create a test call in the system:

**Unix/Mac/Linux:**
```bash
./seed-call.sh
```

**Windows PowerShell:**
```powershell
.\seed-call.ps1
```

**Expected Output:**
```
Seeding call with ID: f47ac10b-58cc-4372-a567-0e02b2c3d479
Response: {"ok":true,"call_id":"f47ac10b-58cc-4372-a567-0e02b2c3d479"}

Call ID: f47ac10b-58cc-4372-a567-0e02b2c3d479
Save this ID for subsequent tests
```

### 2. Start Transcription

Trigger transcription for the seeded call:

```bash
./transcribe.sh f47ac10b-58cc-4372-a567-0e02b2c3d479
```

**Expected Output:**
```
Starting transcription for call: f47ac10b-58cc-4372-a567-0e02b2c3d479

Response: {"ok":true,"engine":"deepgram","lang":"en"}

✅ Transcription job started successfully
Use stream-status.sh to monitor progress
```

### 3. Monitor Real-time Status (SSE)

Watch live status updates via Server-Sent Events:

**Shell script (curl):**
```bash
./stream-status.sh f47ac10b-58cc-4372-a567-0e02b2c3d479
```

**Node.js client (with formatted output):**
```bash
node ws-listen.mjs f47ac10b-58cc-4372-a567-0e02b2c3d479
```

**Expected Output:**
```
[2024-01-10 10:30:45] event: status
[2024-01-10 10:30:45] data: {"status":"transcribing","engine":"starting"}
  🎤 Transcription in progress...
[2024-01-10 10:30:52] event: status
[2024-01-10 10:30:52] data: {"status":"done","transcribed":true,"engine":"deepgram","lang":"en"}
  ✅ Processing complete!
```

### 4. Start Analysis

Analyze the transcribed call:

```bash
./analyze.sh f47ac10b-58cc-4372-a567-0e02b2c3d479
```

**Expected Output:**
```
Starting analysis for call: f47ac10b-58cc-4372-a567-0e02b2c3d479

Response: {"ok":true,"qa_score":85,"reason_primary":"support"}

✅ Analysis job started successfully
Use stream-status.sh to monitor progress
```

**On Re-run (Embedding Skip):**
```
Response: {"ok":true,"qa_score":85,"embedding_skipped":true}

✅ Analysis job started successfully
ℹ️  Embedding was skipped (already exists)
```

### 5. Download Transcript

Export the transcript to a text file:

```bash
./download-transcript.sh f47ac10b-58cc-4372-a567-0e02b2c3d479
```

**Expected Output:**
```
Downloading transcript for call: f47ac10b-58cc-4372-a567-0e02b2c3d479
Output file: ./out/f47ac10b-58cc-4372-a567-0e02b2c3d479.txt

✅ Transcript downloaded successfully

File details:
  Size: 2456 bytes
  Lines: 45

Preview (first 5 lines):
---
CALL TRANSCRIPT
Call ID: f47ac10b-58cc-4372-a567-0e02b2c3d479
Date: 2024-01-10 10:30:00
Duration: 2:00
Language: en
---

Full transcript saved to: ./out/f47ac10b-58cc-4372-a567-0e02b2c3d479.txt
```

### 6. Batch Processing

Monitor batch transcription progress:

```bash
./batch-progress.sh
```

**Expected Output:**
```
Starting batch job and monitoring progress...

Initial response: {"ok":true,"batch_id":"batch_1704883845","scanned":10,"posted":10}

Batch ID: batch_1704883845
Total calls to process: 10

Progress:
[====================] 100% (10/10 completed, 0 failed)

✅ Batch processing complete!
  Completed: 10
  Failed: 0
```

## Verification Checklist

✅ **Seed Call**: Returns a valid UUID call ID  
✅ **Transcription**: Job starts successfully, returns engine info  
✅ **SSE Stream**: Shows status transitions (queued → transcribing → done)  
✅ **Analysis**: Job starts, shows QA score and reason  
✅ **Embedding Skip**: Re-running analysis shows `embedding_skipped: true`  
✅ **Download**: Transcript file saved to `./out/<call_id>.txt`  
✅ **Batch Progress**: Shows percentage complete and final counts  

## Troubleshooting

### Common Issues

1. **"Error: .env not found"**
   - Solution: Copy `.env.example` to `.env` and configure your secrets

2. **"HTTP 401: Unauthorized"**
   - Solution: Check that JOBS_SECRET and WEBHOOK_SECRET are correct in `.env`

3. **"No transcript available"**
   - Solution: Ensure transcription completed before downloading

4. **SSE stream shows no events**
   - Solution: Check that the call ID exists and processing has started

5. **Batch shows 0 calls**
   - Solution: Ensure there are calls with recordings but no transcripts in the last 48 hours

### Debug Mode

For verbose output, you can modify scripts to show full curl responses:
```bash
# Remove the -s flag from curl commands for verbose output
curl -v -X POST "$APP_URL/api/jobs/transcribe" ...
```

### Manual API Testing

You can also test endpoints directly:

```bash
# Test health check
curl https://synced-up-call-ai.vercel.app/api/health

# Get call details (public endpoint)
curl https://synced-up-call-ai.vercel.app/api/ui/call/YOUR_CALL_ID

# Trigger batch (requires auth)
curl -H "Authorization: Bearer YOUR_JOBS_SECRET" \
  https://synced-up-call-ai.vercel.app/api/jobs/batch
```

## File Structure

```
scripts/
├── .env.example        # Environment template
├── .env               # Your configuration (git-ignored)
├── seed-call.sh       # Create test call (Unix/Mac/Linux)
├── seed-call.ps1      # Create test call (Windows)
├── transcribe.sh      # Start transcription job
├── analyze.sh         # Start analysis job
├── stream-status.sh   # Monitor SSE events (curl)
├── ws-listen.mjs      # Monitor SSE events (Node.js)
├── batch-progress.sh  # Track batch processing
├── download-transcript.sh  # Export transcript
├── README.md          # This file
└── out/              # Downloaded transcripts
    └── <call_id>.txt
```

## Requirements

- **Unix/Mac/Linux**: bash/sh, curl, standard Unix tools
- **Windows**: PowerShell 5.1+
- **Node.js** (optional): v18+ for `ws-listen.mjs`
- **Network**: Access to the deployed application

## Security Notes

- Never commit `.env` files with real secrets
- JOBS_SECRET and WEBHOOK_SECRET should be strong, random values
- Scripts validate environment variables before making requests
- All job endpoints are protected by bearer token authentication