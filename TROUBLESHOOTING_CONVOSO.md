# Convoso Integration Troubleshooting Guide

## Current Status
✅ Webhook endpoint is live and working at: `https://synced-up-call-ai.vercel.app/api/webhooks/convoso`
✅ Test webhooks are being received and stored successfully
❌ Not receiving actual calls from Convoso

## Issue: Not Receiving Calls from Convoso

### 1. Verify Convoso Webhook Configuration
You need to configure the webhook in your Convoso account:

1. **Log into Convoso Admin Panel**
2. **Navigate to Settings → Webhooks or API Settings**
3. **Add/Update Webhook URL:**
   ```
   https://synced-up-call-ai.vercel.app/api/webhooks/convoso
   ```
4. **Configure Webhook Events:**
   - Enable "Call Completed" events
   - Enable "Call Recording Available" events
   - Enable any other relevant call events

### 2. Check Convoso Webhook Format
Convoso might be sending data in a different format. The webhook currently accepts these fields:
- `call_id` or `convoso_call_id` or `id`
- `lead_id` or `lead.id`
- `agent_id` or `agent.id`
- `agent_name` or `agent.name` or `agent`
- `phone_number` or `customer_phone` or `phone`
- `campaign` or `campaign_name`
- `disposition` or `call_disposition`
- `direction` or `call_direction`
- `duration` or `duration_sec` or `call_duration`
- `recording_url` or `recording` or `call_recording`
- `started_at` or `start_time` or `call_start`
- `ended_at` or `end_time` or `call_end`

### 3. Test the Webhook Manually
Run this command to test if your webhook is working:

```bash
curl -X POST https://synced-up-call-ai.vercel.app/api/webhooks/convoso \
  -H "Content-Type: application/json" \
  -d '{
    "lead_id": "TEST-123",
    "customer_phone": "+15558675309",
    "agent_name": "Test Agent",
    "disposition": "Completed",
    "campaign": "Test Campaign",
    "direction": "outbound",
    "duration": 120,
    "recording_url": "https://example.com/recording.mp3",
    "started_at": "2025-01-12T10:00:00Z",
    "ended_at": "2025-01-12T10:02:00Z"
  }'
```

Expected response:
```json
{"ok":true,"message":"Webhook processed successfully","call_id":"..."}
```

### 4. Check Convoso Webhook Logs
In your Convoso admin panel:
1. Look for webhook logs or API logs
2. Check if webhooks are being sent
3. Check for any error responses
4. Verify the webhook URL is correct

### 5. Verify Webhook Authentication (if required)
If Convoso requires webhook authentication:
1. Check if they send a signature header (like `x-convoso-signature`)
2. Get the webhook secret from Convoso
3. Add to Vercel environment variables:
   ```
   CONVOSO_WEBHOOK_SECRET=your-secret-here
   ```

### 6. Monitor Live Logs
Check Vercel logs for incoming webhooks:
1. Go to: https://vercel.com/nicks-projects-f40381ea/synced-up-call-ai/logs
2. Filter for `/api/webhooks/convoso`
3. Look for incoming requests and any errors

### 7. Common Issues and Solutions

| Issue | Solution |
|-------|----------|
| Webhook URL not configured in Convoso | Add the webhook URL in Convoso settings |
| Webhook events not enabled | Enable call completion events in Convoso |
| IP whitelist blocking | Check if Convoso requires IP whitelisting |
| Authentication failure | Add webhook secret if required |
| Wrong data format | Check actual payload format in Convoso logs |
| Firewall/Security blocking | Ensure no security rules block Convoso IPs |

### 8. Debug Mode
To see exactly what Convoso is sending:
1. Check the webhook logs to see the raw payload
2. The webhook stores the full raw data in the database metadata field
3. Use the echo endpoint for testing: `/api/webhooks/echo`

### 9. Contact Convoso Support
If none of the above works, contact Convoso support with:
- Your webhook URL: `https://synced-up-call-ai.vercel.app/api/webhooks/convoso`
- Request sample webhook payload format
- Ask about authentication requirements
- Verify webhook events are enabled for your account

## Quick Checklist
- [ ] Webhook URL added to Convoso settings
- [ ] Call completion events enabled in Convoso
- [ ] Test webhook responds successfully
- [ ] No authentication errors in logs
- [ ] Convoso shows successful webhook deliveries
- [ ] Database is storing test webhooks

## Need Help?
1. Check Vercel logs for errors
2. Test with the echo endpoint first
3. Verify Convoso webhook configuration
4. Contact Convoso support for their webhook documentation