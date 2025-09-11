# Environment Variables Configuration

## Required Variables (Must Have)

```bash
# Database
DATABASE_URL=postgresql://user:pass@host:5432/dbname?sslmode=require

# Webhook Security
CONVOSO_WEBHOOK_SECRET=<from_convoso_dashboard>
JOBS_SECRET=<random_secure_string>

# AI Services
OPENAI_API_KEY=sk-...
DEEPGRAM_API_KEY=<from_deepgram>
ASSEMBLYAI_API_KEY=<from_assemblyai>
```

## Optional Variables (Enhanced Features)

```bash
# Slack Notifications
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
SLACK_ALERT_WEBHOOK=https://hooks.slack.com/services/...

# Cron Authentication
CRON_SECRET=<random_secure_string>

# Application URLs
APP_URL=https://synced-up-call-ai.vercel.app
NEXT_PUBLIC_APP_URL=https://synced-up-call-ai.vercel.app

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100

# Feature Flags
ENABLE_SLACK_ALERTS=true
ENABLE_PII_MASKING=true
ENABLE_AUTO_RETRY=true
```

## Setting Variables in Vercel

```bash
# Add a single variable
vercel env add DATABASE_URL production

# Pull all variables locally
vercel env pull .env.local

# List all variables
vercel env ls
```

## Local Development

Create a `.env.local` file:

```bash
# Copy from example
cp .env.local.example .env.local

# Edit with your values
nano .env.local
```

## Security Notes

1. **Never commit** `.env` or `.env.local` files
2. **Rotate secrets** quarterly
3. **Use different values** for dev/staging/prod
4. **Audit access** to production variables
5. **Enable 2FA** on Vercel account

## Validation

Check all variables are set:

```bash
curl https://synced-up-call-ai.vercel.app/api/health
```

Response should show all env vars as `true`:

```json
{
  "ok": true,
  "env": {
    "DATABASE_URL": true,
    "CONVOSO_WEBHOOK_SECRET": true,
    "JOBS_SECRET": true,
    "OPENAI_API_KEY": true,
    "DEEPGRAM_API_KEY": true,
    "ASSEMBLYAI_API_KEY": true
  }
}
```