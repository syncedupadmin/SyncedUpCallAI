# Deployment Checklist for Vercel

## Recent Changes Summary
- ✅ Implemented smart retry strategy for recording fetching (up to 6 hours)
- ✅ Created automatic transcription pipeline with queue system
- ✅ Fixed bulk upload by IDs functionality
- ✅ Added immediate transcription triggers
- ✅ Extended batch job lookback to 7 days
- ✅ Fixed React hydration errors in upload-leads page

## 1. Database Migrations to Run

Run these migrations in order on your Supabase database:

```sql
-- 1. Recording retry strategy migration
supabase/migrations/fix-recording-retry-strategy.sql

-- 2. Transcription queue migration
supabase/migrations/add-transcription-queue.sql
```

## 2. Environment Variables Required

Ensure these are set in Vercel Dashboard (Settings → Environment Variables):

### Core Variables
- `DATABASE_URL` - Supabase connection string
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_ANON_KEY` - Supabase anonymous key
- `SUPABASE_SERVICE_KEY` - Supabase service key

### Convoso Integration
- `CONVOSO_API_BASE` - Convoso API base URL
- `CONVOSO_API_KEY` - Convoso API key
- `CONVOSO_AUTH_TOKEN` - Convoso auth token
- `WEBHOOK_SECRET` - (Optional) Webhook validation secret

### Transcription Services
- `OPENAI_API_KEY` - For GPT-4 analysis
- `ANTHROPIC_API_KEY` - (Optional) Fallback for analysis
- `DEEPGRAM_API_KEY` - (Optional) For transcription
- `ASSEMBLYAI_API_KEY` - (Optional) For transcription

### System
- `APP_URL` - Your Vercel app URL (https://your-app.vercel.app)
- `JOBS_SECRET` - Secret for internal job endpoints
- `NODE_ENV` - Set to 'production'

## 3. Updated Cron Jobs

The following cron jobs are configured in `vercel.json`:

- **Process Recordings** - Every minute (`*/1 * * * *`)
  - Endpoint: `/api/cron/process-recordings-v3`
  - Fetches recordings with exponential backoff

- **Process Transcription Queue** - Every minute (`*/1 * * * *`)
  - Endpoint: `/api/cron/process-transcription-queue`
  - Processes queued transcriptions

- **Batch Job** - Every 5 minutes (`*/5 * * * *`)
  - Endpoint: `/api/jobs/batch`
  - Finds and queues untranscribed recordings

## 4. New Features Available

### Recording Retry Strategy
- Recordings are fetched with smart exponential backoff
- Handles calls up to 6 hours long
- Maximum 12 attempts over 6 hours

### Transcription Pipeline
- Automatic queuing when recordings are available
- Priority-based processing
- Immediate transcription for completed calls

### Admin Tools
- **Bulk Upload by IDs**: `/admin/super/upload-leads`
- **Manual Transcription**: `/api/admin/transcribe-call`
- **Queue Status**: GET `/api/admin/transcribe-call`

## 5. Deployment Steps

### Step 1: Prepare Local Changes
```bash
# Check git status
git status

# Add all changes
git add .

# Review changes
git diff --staged
```

### Step 2: Run Migrations
```bash
# Connect to Supabase and run migrations
# Option 1: Via Supabase CLI
supabase db push

# Option 2: Via SQL Editor in Supabase Dashboard
# Copy and run each migration file
```

### Step 3: Commit Changes
```bash
# Commit with descriptive message
git commit -m "feat: add smart recording retry & automatic transcription pipeline

- Implement exponential backoff for recording fetches (up to 6 hours)
- Create transcription queue with priority processing
- Fix bulk upload functionality with auto-transcription
- Extend batch job lookback to 7 days
- Fix React hydration errors in upload pages"
```

### Step 4: Deploy to Vercel
```bash
# Push to main branch (auto-deploys)
git push origin main

# Or use Vercel CLI
vercel --prod
```

## 6. Post-Deployment Verification

### Check Deployment Status
1. Go to Vercel Dashboard
2. Check build logs for any errors
3. Verify all functions deployed successfully

### Test Key Features
1. **Test Webhook**: Send a test call webhook
2. **Test Upload**: Upload a small batch of lead IDs
3. **Check Cron Jobs**: Monitor cron execution in Vercel Functions tab
4. **Verify Queue**: Check transcription queue status:
   ```bash
   curl https://your-app.vercel.app/api/admin/transcribe-call
   ```

### Monitor Logs
- Check Vercel Functions logs for errors
- Monitor Supabase logs for database issues
- Review cron job execution times

## 7. Rollback Plan

If issues occur:

1. **Revert in Vercel**: Use "Instant Rollback" in Vercel Dashboard
2. **Revert Git**:
   ```bash
   git revert HEAD
   git push origin main
   ```
3. **Database Rollback**: Keep migration rollback scripts ready

## 8. Webhook Update

Update your Convoso webhook configuration to use the new endpoint:
- Old: `/api/webhooks/convoso-calls`
- New: `/api/webhooks/convoso-calls-immediate` (for immediate recording fetch)

## Success Indicators

✅ No build errors in Vercel
✅ Cron jobs executing every minute
✅ Recordings being queued for transcription
✅ Transcriptions processing within 1-2 minutes
✅ Upload page loads without React errors
✅ Database migrations applied successfully

## Support & Monitoring

- **Vercel Functions**: Monitor at https://vercel.com/[your-team]/[your-project]/functions
- **Database**: Check at https://app.supabase.com/project/[your-project]/database
- **Logs**: Real-time logs at Vercel Dashboard → Functions → Logs

## Notes

- The system now handles recordings for calls up to 6 hours long
- All recordings are automatically queued for transcription
- Priority system ensures recent/important calls are processed first
- Batch job serves as safety net for any missed recordings