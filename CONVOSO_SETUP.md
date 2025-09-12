# Convoso Integration Setup Guide

## ✅ Webhook Configuration Complete

Your Convoso webhook is configured and ready at:
```
https://synced-up-call-ai.vercel.app/api/webhooks/convoso
```

## Current Processing Mode: Storage Only

Calls are being received and stored, but not automatically processed.

## To Enable Full Auto-Processing:

### 1. Add Environment Variables in Vercel Dashboard:

Go to: https://vercel.com/nicks-projects-f40381ea/synced-up-call-ai/settings/environment-variables

Add these variables:
```
AUTO_TRANSCRIBE=true
JOBS_SECRET=<generate-a-random-secret>
```

### 2. Redeploy After Adding Variables:
```bash
vercel --prod --yes
```

## What Happens With Auto-Processing Enabled:

1. **Call Received** → Webhook stores call data
2. **Recording URL Present** → Triggers transcription job
3. **Transcription Complete** → Generates embeddings
4. **Embeddings Ready** → Triggers AI analysis
5. **Analysis Complete** → Full call insights available

## Manual Processing (Current Mode):

Visit: https://synced-up-call-ai.vercel.app/admin

- Click 'Process Pending' to transcribe calls
- Click 'Backfill' to process historical calls

## Monitoring:

- **Dashboard**: https://synced-up-call-ai.vercel.app/dashboard
- **Vercel Logs**: https://vercel.com/nicks-projects-f40381ea/synced-up-call-ai/logs
- **Test Webhook**: `curl -X POST https://synced-up-call-ai.vercel.app/api/webhooks/echo -H 'Content-Type: application/json' -d '{"test": true}'`

