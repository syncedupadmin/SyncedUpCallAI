# Convoso Webhook Setup Instructions

## Overview
This application receives webhook data from Convoso for both leads and calls. The webhooks are now properly configured to save data to the database with comprehensive validation and error handling.

## Webhook Endpoints

### 1. Lead/Contact Webhook
- **URL**: `https://your-domain.vercel.app/api/webhooks/convoso-leads`
- **Method**: POST
- **Purpose**: Receives and stores lead/contact information

**Expected Fields** (flexible mapping):
```json
{
  "lead_id": "12345",           // or "id", "owner_id", "created_by"
  "phone_number": "555-0100",   // or "phone"
  "first_name": "John",
  "last_name": "Doe",
  "email": "john@example.com",
  "address": "123 Main St",     // or "address1"
  "city": "New York",
  "state": "NY",
  "list_id": "LIST-001"
}
```

### 2. Call Webhook
- **URL**: `https://your-domain.vercel.app/api/webhooks/convoso-calls`
- **Method**: POST
- **Purpose**: Receives and stores call records

**Required Fields**:
- `agent_name` (or `agent`)
- `disposition` (or `status`)
- `duration`

**Expected Fields**:
```json
{
  "call_id": "CALL-12345",      // or "uniqueid", "id"
  "lead_id": "LEAD-12345",       // or "owner_id"
  "agent_name": "John Agent",    // REQUIRED
  "phone_number": "555-0200",    // or "phone", "customer_phone"
  "disposition": "SALE",          // REQUIRED
  "duration": 120,                // REQUIRED (in seconds)
  "campaign": "Campaign Name",
  "recording_url": "https://...",
  "started_at": "2024-01-01T10:00:00Z",
  "ended_at": "2024-01-01T10:02:00Z"
}
```

## Database Setup

### 1. Run the Migration
Execute the migration to set up the proper database schema:

```bash
# From your project root
psql $DATABASE_URL < supabase/migrations/fix-convoso-schema.sql
```

Or run it in Supabase SQL Editor:
1. Go to your Supabase project
2. Navigate to SQL Editor
3. Copy and paste the contents of `supabase/migrations/fix-convoso-schema.sql`
4. Run the query

### 2. Verify Tables
The migration creates/updates these tables:
- `contacts` - Stores lead/contact information
- `calls` - Stores call records
- `pending_recordings` - Queue for recordings to fetch
- `webhook_logs` - Debug log for all webhook requests
- `call_details` - View joining calls with contacts

## Environment Variables

Add these to your Vercel environment variables:

```env
# Optional but recommended for production
WEBHOOK_SECRET=your-secret-key-here

# Required for Convoso API integration
CONVOSO_AUTH_TOKEN=your-convoso-auth-token

# Database (should already be set by Vercel)
DATABASE_URL=your-database-url
```

## Testing Webhooks

### 1. Using the Test Endpoint
Test your webhook setup without Convoso:

```bash
# Test lead webhook
curl -X POST https://your-domain.vercel.app/api/test/webhook-verify \
  -H "Content-Type: application/json" \
  -d '{"type": "lead"}'

# Test call webhook
curl -X POST https://your-domain.vercel.app/api/test/webhook-verify \
  -H "Content-Type: application/json" \
  -d '{"type": "call"}'

# Test with custom data
curl -X POST https://your-domain.vercel.app/api/test/webhook-verify \
  -H "Content-Type: application/json" \
  -d '{
    "type": "call",
    "test_data": {
      "call_id": "MY-TEST-123",
      "lead_id": "LEAD-456",
      "agent_name": "Test Agent",
      "disposition": "SALE",
      "duration": 180
    }
  }'
```

### 2. Check Webhook Status
View recent webhook activity:

```bash
curl https://your-domain.vercel.app/api/test/webhook-verify
```

This shows:
- Recent contacts and calls
- Webhook logs
- Statistics
- Pending recordings count

## Convoso Configuration

### In Convoso Admin Panel:

1. **For Lead Webhooks**:
   - Navigate to Settings > Webhooks
   - Add New Webhook
   - URL: `https://your-domain.vercel.app/api/webhooks/convoso-leads`
   - Method: POST
   - Events: Lead Created, Lead Updated

2. **For Call Webhooks**:
   - Add New Webhook
   - URL: `https://your-domain.vercel.app/api/webhooks/convoso-calls`
   - Method: POST
   - Events: Call Completed, Call Updated

3. **Add Security Header** (if using webhook secret):
   - Header Name: `X-Webhook-Secret`
   - Header Value: Your secret key

## Troubleshooting

### 1. Check Webhook Logs
Query the database to see all webhook requests:

```sql
SELECT * FROM webhook_logs ORDER BY created_at DESC LIMIT 20;
```

### 2. Verify Data is Being Saved

Check contacts:
```sql
SELECT * FROM contacts ORDER BY created_at DESC LIMIT 10;
```

Check calls:
```sql
SELECT * FROM calls ORDER BY created_at DESC LIMIT 10;
```

### 3. View Combined Data
Use the call_details view:
```sql
SELECT * FROM call_details ORDER BY created_at DESC LIMIT 10;
```

### 4. Common Issues

**Issue**: Webhooks return 401 Unauthorized
- **Solution**: Check that `X-Webhook-Secret` header matches `WEBHOOK_SECRET` env var

**Issue**: Data not being saved
- **Solution**: Check webhook_logs table for errors, verify required fields are present

**Issue**: Missing recordings
- **Solution**: Check pending_recordings table, ensure CONVOSO_AUTH_TOKEN is set

## API Endpoints Summary

| Endpoint | Purpose |
|----------|---------|
| `/api/webhooks/convoso-leads` | Receives lead data from Convoso |
| `/api/webhooks/convoso-calls` | Receives call data from Convoso |
| `/api/test/webhook-verify` | Test webhook functionality |
| `/api/test/convoso-diagnose` | Diagnose Convoso API connectivity |

## Data Flow

1. Convoso sends webhook to your endpoint
2. Webhook validates security (if configured)
3. Data is logged to `webhook_logs` table
4. Data is parsed and validated
5. For leads: Upserted to `contacts` table
6. For calls: Upserted to `calls` table
7. If no recording URL: Added to `pending_recordings` queue
8. Response sent back to Convoso

## Next Steps

1. Run the database migration
2. Deploy the updated webhook code
3. Configure webhooks in Convoso
4. Test using the verify endpoint
5. Monitor webhook_logs for any issues