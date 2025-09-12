# Convoso Integration Guide

## Overview
This system integrates with Convoso to capture call and lead data through webhooks. The integration includes separate endpoints for different data types and a comprehensive super admin portal for management and testing.

## Webhook Endpoints

### 1. Lead Webhook
**URL:** `https://your-domain.com/api/webhooks/convoso-leads`
**Purpose:** Receives lead/contact information from Convoso

Expected payload:
```json
{
  "lead_id": "uuid",
  "first_name": "John",
  "last_name": "Doe",
  "phone_number": "555-0123",
  "email": "john@example.com",
  "address": "123 Main St",
  "city": "Anytown",
  "state": "CA",
  "zip": "12345",
  "campaign": "Campaign Name"
}
```

### 2. Call Webhook
**URL:** `https://your-domain.com/api/webhooks/convoso`
**Purpose:** Receives call completion data from Convoso

Expected payload:
```json
{
  "call_id": "uuid",
  "lead_id": "uuid",
  "agent_id": "agent-123",
  "agent_name": "Agent Name",
  "phone_number": "555-0123",
  "campaign": "Campaign Name",
  "disposition": "SALE",
  "direction": "outbound",
  "duration": 120,
  "recording_url": "https://...",
  "started_at": "2025-01-01T10:00:00Z",
  "ended_at": "2025-01-01T10:02:00Z"
}
```

### 3. Echo Test Webhook
**URL:** `https://your-domain.com/api/webhooks/echo`
**Purpose:** Testing webhook connectivity - echoes back any data sent

## Super Admin Portal

Access the portal at: `/admin/super`

### Features:
1. **Overview Tab**
   - System health status
   - Recent activity
   - Database statistics
   - Active webhook endpoints

2. **Webhook Logs Tab**
   - View all webhook requests
   - Filter by type (lead/call)
   - View full payload data
   - Clear test data

3. **Leads Tab**
   - View all captured leads
   - Track conversion status
   - Export lead data

4. **Calls Tab**
   - View all call records
   - Check recording status
   - Filter by campaign/agent

5. **Test Tools Tab**
   - Send test lead webhooks
   - Send test call webhooks
   - View test results
   - cURL command examples

## Configuration

### Environment Variables
Create a `.env.local` file with:

```bash
# Database Configuration
DATABASE_URL=postgres://user:password@host:port/database

# Convoso Configuration (optional)
CONVOSO_WEBHOOK_SECRET=your-webhook-secret

# Vercel Configuration
VERCEL=1
NODE_ENV=production
```

### Database Requirements
The system requires these PostgreSQL tables:
- `calls` - Stores call records
- `agents` - Stores agent information
- `call_events` - Stores webhook payloads and metadata
- `contacts` - Stores lead/contact information

Run migrations:
```bash
psql $DATABASE_URL < migrations/000_init.sql
psql $DATABASE_URL < migrations/001_indexes.sql
psql $DATABASE_URL < migrations/002_pending_recordings.sql
```

## Troubleshooting

### Issue: No data showing in dashboard
**Cause:** Convoso may be sending lead data instead of call data
**Solution:** 
1. Check `/admin/super` webhook logs to see what data is being received
2. Configure Convoso to send call completion events
3. Verify webhook URLs are correctly configured in Convoso

### Issue: Database connection errors
**Cause:** Missing or incorrect DATABASE_URL
**Solution:**
1. Verify DATABASE_URL is set in `.env.local`
2. Check database credentials are correct
3. Ensure database server is accessible

### Issue: Webhooks not being received
**Solution:**
1. Test with echo webhook: `curl -X POST https://your-domain/api/webhooks/echo -H "Content-Type: application/json" -d '{"test": "data"}'`
2. Check Convoso webhook configuration
3. Verify no firewall/security rules blocking requests
4. Use `/admin/super` test tools to verify endpoints

## Testing Webhooks

### Using cURL

Test lead webhook:
```bash
curl -X POST https://your-domain/api/webhooks/convoso-leads \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "Test",
    "last_name": "User",
    "phone_number": "555-0123",
    "email": "test@example.com"
  }'
```

Test call webhook:
```bash
curl -X POST https://your-domain/api/webhooks/convoso \
  -H "Content-Type: application/json" \
  -d '{
    "call_id": "test-123",
    "duration": 120,
    "disposition": "SALE",
    "agent_name": "Test Agent"
  }'
```

### Using Super Admin Portal
1. Navigate to `/admin/super`
2. Click on "Test Tools" tab
3. Use "Send Test Lead" or "Send Test Call" buttons
4. View results in real-time

## Recording Fetcher System

The system includes a queued recording fetcher that:
1. Receives call webhooks without recording URLs
2. Queues a fetch attempt for 2 minutes later
3. Attempts to retrieve the recording from Convoso
4. Updates the call record with the recording URL

This handles cases where recordings aren't immediately available when the call completes.

## Monitoring

### Health Check Endpoint
**URL:** `/api/admin/health`

Returns:
```json
{
  "ok": true,
  "healthy": true,
  "pool": {
    "totalCount": 10,
    "idleCount": 8,
    "waitingCount": 0
  },
  "stats": {
    "calls": 1247,
    "agents": 42,
    "events": 3891
  }
}
```

### Database Pool Status
The system uses connection pooling with:
- Max connections: 10
- Min connections: 2
- Idle timeout: 30 seconds
- Connection timeout: 10 seconds
- Automatic retry with exponential backoff

## Security Considerations

1. **Webhook Signature Verification** (optional)
   - Set `CONVOSO_WEBHOOK_SECRET` environment variable
   - System will verify `x-convoso-signature` header

2. **Super Admin Portal**
   - Currently no authentication (add in production)
   - Clear data function only removes test data
   - All actions are logged

3. **Database Security**
   - Uses parameterized queries
   - Connection pooling with SSL in production
   - Graceful error handling

## Deployment to Vercel

1. Push code to GitHub
2. Connect repository to Vercel
3. Set environment variables in Vercel dashboard:
   - DATABASE_URL
   - CONVOSO_WEBHOOK_SECRET (optional)
4. Deploy
5. Configure Convoso with production webhook URLs
6. Test using `/admin/super` portal

## Support

For issues or questions:
1. Check webhook logs in `/admin/super`
2. Verify database health at `/api/admin/health`
3. Test endpoints using echo webhook
4. Review error logs in Vercel dashboard