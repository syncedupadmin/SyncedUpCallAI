# SyncedUp Call AI

Batch call analytics for insurance sales/service using Deepgram + OpenAI. Hotlinks to Convoso recordings, analyzes only calls >= 10s, and keeps a customer journey across calls.

## Quick Start
1. Copy `.env.local.example` to `.env.local` and fill secrets.
2. Run migrations:
   ```bash
   npm i
   npm run migrate
   ```
3. Deploy to Vercel. Add env vars and keep region in US-East.
4. Set Convoso webhook to:
   ```
   POST $APP_URL/api/hooks/convoso
   Header: x-webhook-secret: $CONVOSO_WEBHOOK_SECRET
   ```
5. Vercel Cron is set to hit `/api/jobs/batch` every 5 minutes to process eligible calls.

## Notes
- Processes only calls with duration >= 10 seconds, but transcribes full audio so the opener isn't missed.
- Semantic search uses `pgvector` + OpenAI embeddings. Run `migrations/000_init.sql` to enable.
- Revenue report uses `policies_stub` until your CRM is integrated. High-value is defined as premium >= $300/month.

## Env
See `.env.local.example` for required variables.

## Scripts
- `npm run migrate` apply base schema
- `npm run backfill` requeue last 30 days without transcripts

## Quick Validate

Test the system's real-time features, batch processing, and exports:

```bash
cd scripts
cp .env.example .env
# Edit .env with your secrets
./seed-call.sh           # Create test call
./transcribe.sh <id>      # Start transcription
./stream-status.sh <id>   # Watch live status
./download-transcript.sh <id>  # Export transcript
```

See [scripts/README.md](scripts/README.md) for complete testing documentation.

## License
You can license this out; runtime is portable.
