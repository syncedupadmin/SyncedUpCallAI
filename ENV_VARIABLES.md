# Environment Variables Documentation

## Required Environment Variables

### Core Configuration
- **APP_URL**: Your application's base URL (e.g., `https://your-domain.com`)
  - Used for webhook callbacks and API endpoints

### Database
- **DIRECT_URL**: PostgreSQL connection string
  - Format: `postgresql://user:password@host:port/database?sslmode=require`
- **DATABASE_URL**: PostgreSQL connection string (alias for DIRECT_URL)

### Supabase (for Authentication)
- **NEXT_PUBLIC_SUPABASE_URL**: Your Supabase project URL
  - Example: `https://xxxxx.supabase.co`
  - Get from: Supabase Dashboard > Settings > API
- **NEXT_PUBLIC_SUPABASE_ANON_KEY**: Your Supabase anonymous key
  - Get from: Supabase Dashboard > Settings > API > Project API keys > anon public
- **SUPABASE_SERVICE_ROLE_KEY**: Your Supabase service role key (for server-side operations)
  - Get from: Supabase Dashboard > Settings > API > Project API keys > service_role

### Security & Authentication
- **ADMIN_SECRET**: Admin portal password (CRITICAL - CHANGE THIS!)
  - Used for accessing `/admin/super` portal
  - Also used for admin API authentication via `x-admin-secret` header
  - Example: Generate a strong password using: `openssl rand -base64 32`

- **ADMIN_EMAIL**: Admin email address (default: `admin@syncedupsolutions.com`)
  - Used for admin authentication and elevated privileges
  - This user will have access to the super admin portal

- **JOBS_SECRET**: Secret for job queue authentication
  - Used for background job processing

- **CRON_SECRET**: Secret for cron job authentication
  - Used for scheduled tasks

### Convoso Integration
- **CONVOSO_AUTH_TOKEN**: Convoso API authentication token
  - Get from Convoso portal settings

- **CONVOSO_WEBHOOK_SECRET**: Secret for Convoso webhook verification
  - Configure in Convoso webhook settings

### AI & Transcription Services
- **OPENAI_API_KEY**: OpenAI API key
  - Used for call analysis and embeddings

- **ASR_PRIMARY**: Primary transcription service (`deepgram` or `assemblyai`)
- **ASR_FALLBACK**: Fallback transcription service (`assemblyai` or `deepgram`)
- **DEEPGRAM_API_KEY**: Deepgram API key (if using Deepgram)
- **ASSEMBLYAI_API_KEY**: AssemblyAI API key (if using AssemblyAI)

### Optional Configuration
- **HIPAA_MODE**: Enable HIPAA compliance mode (`true` or `false`, default: `false`)
- **REDACTION**: Enable PII redaction (`true` or `false`, default: `false`)
- **ENABLE_TEST_ENDPOINTS**: Enable test webhook endpoints in production (`true` or `false`, default: `false`)
  - ⚠️ WARNING: Only enable for debugging. Test endpoints are automatically disabled in production unless this is set to `true`

## Setting Up Environment Variables

### Local Development
1. Copy `.env.check` to `.env.local`
2. Update all values with your actual credentials
3. **IMPORTANT**: Never commit `.env.local` to version control

### Production (Vercel)
1. Go to your Vercel project settings
2. Navigate to Environment Variables
3. Add each variable listed above
4. **CRITICAL**: Set a strong, unique `ADMIN_SECRET`

## Security Best Practices

1. **ADMIN_SECRET**:
   - Use a minimum of 32 characters
   - Include uppercase, lowercase, numbers, and symbols
   - Change regularly
   - Never share or expose this value

2. **API Keys**:
   - Rotate keys regularly
   - Use separate keys for development and production
   - Monitor usage for anomalies

3. **Database URL**:
   - Always use SSL connections (`sslmode=require`)
   - Use connection pooling in production
   - Limit database user permissions

## Webhook Endpoints

After deployment, configure these webhooks in Convoso:

- **Lead Webhook**: `{APP_URL}/api/webhooks/convoso-leads`
- **Call Webhook**: `{APP_URL}/api/webhooks/convoso`

## Troubleshooting

### Admin Access Issues
- Verify `ADMIN_SECRET` is set in environment
- Check browser cookies are enabled
- Try clearing browser cache

### Convoso Integration Issues
- Verify `CONVOSO_AUTH_TOKEN` is correct
- Check circuit breaker status in admin portal
- Review sync history for errors

### Database Connection Issues
- Verify `DIRECT_URL` format is correct
- Check SSL certificate requirements
- Ensure database is accessible from deployment environment