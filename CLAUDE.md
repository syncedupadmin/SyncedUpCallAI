# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
- `npm run dev` - Start Next.js development server on port 3000
- `npm run build` - Build production bundle
- `npm start` - Run production server

### Database Operations
- `npm run migrate` - Apply base schema from migrations/000_init.sql
- `npm run backfill` - Run backfill script to requeue last 30 days without transcripts
- `npm run seed:demo` - Seed demo data
- `npm run backfill:meta` - Backfill metadata

### Testing
Use the scripts in the `scripts/` directory for testing real-time features:
- `./seed-call.sh` - Create test call
- `./transcribe.sh <id>` - Start transcription
- `./stream-status.sh <id>` - Watch live status
- `./download-transcript.sh <id>` - Export transcript

## Architecture

### Tech Stack
- **Frontend**: Next.js 14 with App Router, React 18, TypeScript, Tailwind CSS
- **Backend**: Next.js API routes, Supabase (auth, database, RLS)
- **Database**: PostgreSQL with pgvector for embeddings
- **AI Services**: Deepgram/AssemblyAI for transcription, OpenAI for analysis
- **Deployment**: Vercel with cron jobs

### Key Directories
- `src/app/` - Next.js App Router pages and layouts
- `src/app/api/` - API routes organized by domain (admin, calls, jobs, hooks)
- `src/lib/` - Shared business logic and utilities
- `src/server/` - Server-side code (database, auth, ASR services)
- `src/components/` - React components
- `supabase/migrations/` - Database migration files
- `migrations/` - Legacy migration files (000_init.sql, 001_policies_stub.sql)

### Core Services

**Call Processing Pipeline**:
1. Convoso webhook → `/api/hooks/convoso` (receives call notifications)
2. Queue recording → `/api/cron/queue-bulk-recordings` (runs every 5 min)
3. Process recordings → `/api/cron/process-recordings-v3` (runs every minute)
4. Transcribe → `/api/cron/process-transcription-queue` (runs every minute)
5. Batch analysis → `/api/jobs/batch` (runs every 5 min, processes calls ≥10s)

**Key Libraries**:
- `@supabase/supabase-js` - Database and auth
- `@deepgram/sdk` - Primary ASR
- `openai` - Analysis and embeddings
- `pg` - Direct PostgreSQL access when needed

### Authentication & Authorization
- Supabase Auth with email/password
- Row Level Security (RLS) policies for multi-tenancy
- Admin client uses service role key (`src/lib/supabase-admin.ts`)
- User clients use anon key with JWT auth

### Environment Variables
Required variables (see `.env.local.example`):
- `DATABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
- `CONVOSO_WEBHOOK_SECRET`, `CONVOSO_AUTH_TOKEN`
- `DEEPGRAM_API_KEY`, `OPENAI_API_KEY`
- `JOBS_SECRET`, `CRON_SECRET`
- `APP_URL` (production URL)

### Vercel Cron Jobs
Configured in `vercel.json`:
- Every minute: process recordings, transcription queue
- Every 5 minutes: queue recordings, batch analysis
- Every 15 minutes: Convoso auto-sync
- Daily: rollup stats, retention cleanup, KPI calculations

### API Route Patterns
- Protected routes check auth via Supabase session
- Cron routes validate `CRON_SECRET` header
- Admin routes require admin role check
- Webhook routes validate signature/secret

### Database Schema
Main tables:
- `calls` - Call records with transcripts and analysis
- `customer_journey` - Cross-call customer tracking
- `agencies` - Multi-tenant organizations
- `agency_members` - User-agency relationships
- `kpi_daily`, `kpi_weekly` - Aggregated metrics

### TypeScript Configuration
- Path alias: `@/*` maps to `src/*`
- Strict mode enabled
- Target ES2021
- Module resolution: Bundler