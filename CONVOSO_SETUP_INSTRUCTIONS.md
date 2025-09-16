# 🚨 URGENT: Convoso Configuration Required

## Current Problem
Your Convoso is ONLY sending phone numbers via lead webhooks. You're missing:
- ❌ Agent names
- ❌ Call dispositions
- ❌ Call durations
- ❌ Recording URLs
- ❌ Call IDs

This is why your admin panel shows "Unknown" for everything!

## What You Need to Configure in Convoso

### You Need TWO Different Webhooks:

### 1️⃣ **LEAD WEBHOOK** (You have this, but it's incomplete)
- **URL:** `https://synced-up-call-ai.vercel.app/api/webhooks/convoso`
- **Trigger:** When a new lead is created/imported
- **Fields to send:**
  - lead_id
  - first_name
  - last_name
  - phone_number
  - email
  - address
  - city
  - state

### 2️⃣ **CALL WEBHOOK** (THIS IS MISSING! - CRITICAL)
- **URL:** `https://synced-up-call-ai.vercel.app/api/webhooks/convoso-calls`
- **Trigger:** On Call Complete / Call Disposition / After Call Work
- **Fields to send:**
  - call_id (or uniqueid)
  - lead_id
  - agent_name (or agent)
  - disposition
  - duration
  - campaign
  - recording_url (if available)

### Both Webhooks Need:
- **Method:** POST
- **Content-Type:** application/json
- **Custom Header:** `X-Webhook-Secret: your-secret-here`

## Step-by-Step Convoso Setup

### In Convoso Admin Panel:

1. **Go to:** Settings → Integrations → Webhooks (or API Webhooks)

2. **Find or Create "Call Complete" Webhook:**
   - Name: Call Complete Webhook
   - URL: `https://synced-up-call-ai.vercel.app/api/webhooks/convoso-calls`
   - Method: POST
   - Format: JSON
   - Trigger: Call Complete / Disposition Set

3. **Map These Fields:** (exact field names may vary in Convoso)
   ```json
   {
     "call_id": "{CALL_ID}",
     "lead_id": "{LEAD_ID}",
     "agent_name": "{AGENT_NAME}",
     "disposition": "{DISPOSITION}",
     "duration": "{DURATION}",
     "campaign": "{CAMPAIGN}",
     "recording_url": "{RECORDING_URL}"
   }
   ```

4. **Add Header:**
   - Header Name: `X-Webhook-Secret`
   - Header Value: `test-secret` (or your chosen secret)

5. **Test the Webhook:**
   - Make a test call in Convoso
   - Set a disposition
   - Check if data appears in your admin panel

## Quick Test

After configuring, run this to test:
```bash
curl -X POST https://synced-up-call-ai.vercel.app/api/webhooks/convoso-calls \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: test-secret" \
  -d '{
    "call_id": "TEST123",
    "lead_id": "LEAD456",
    "agent_name": "John Smith",
    "disposition": "SALE",
    "duration": 300,
    "campaign": "Test Campaign",
    "recording_url": "https://example.com/recording.mp3"
  }'
```

You should see this test call appear in your admin panel with all the data!

## Environment Variables Needed

Make sure these are set in Vercel:
```
WEBHOOK_SECRET=test-secret
CONVOSO_API_KEY=your-convoso-api-key
CONVOSO_API_BASE=https://api.convoso.com
```

## If Convoso Doesn't Support Call Webhooks

If Convoso doesn't have call complete webhooks, you'll need to:
1. Use their API to poll for completed calls periodically
2. Or use their real-time events/websocket connection
3. Or integrate via their CRM export feature

Contact Convoso support and ask specifically for:
- "Call Complete Webhook"
- "Disposition Webhook"
- "After Call Work (ACW) Webhook"
- "Call Event Webhook"

## Database Cleanup (After Fixing Webhooks)

Once webhooks are configured, run this SQL to clean up empty records:
```sql
-- Delete calls with no useful data
DELETE FROM calls
WHERE agent_name IS NULL
  AND disposition IS NULL
  AND duration IS NULL
  AND recording_url IS NULL
  AND created_at > NOW() - INTERVAL '7 days';

-- Check remaining good calls
SELECT COUNT(*),
       COUNT(agent_name) as with_agent,
       COUNT(disposition) as with_disposition
FROM calls
WHERE created_at > NOW() - INTERVAL '1 day';
```

## Support Contact

If you need help finding these settings in Convoso:
- Contact Convoso Support
- Reference: "API Webhooks for Call Events"
- Ask for: "Call Complete webhook documentation"