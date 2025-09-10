# Convoso Webhook Setup Guide

## Overview
Your system is configured to receive call data from Convoso via webhooks. Since you don't have API access, Convoso will push call data to your endpoint when calls complete.

## Webhook Endpoint
- **URL**: `https://synced-up-call-ai.vercel.app/api/hooks/convoso`
- **Method**: POST
- **Secret**: `8nf3i9mmzoxidg3ntm28gbxvlhdiqo3p`

## Setup in Convoso Dashboard

1. Log into your Convoso account
2. Navigate to Settings → Webhooks (or Integrations)
3. Create a new webhook with these settings:
   - **Webhook URL**: `https://synced-up-call-ai.vercel.app/api/hooks/convoso`
   - **Authorization Token/Secret**: `8nf3i9mmzoxidg3ntm28gbxvlhdiqo3p`
   - **Events**: Select "Call Completed" or similar
   - **Method**: POST
   - **Format**: JSON

## Testing the Webhook

Test locally to ensure everything is working:

```bash
node scripts/test-webhook-local.js
```

This sends a sample call to your webhook and verifies it's processing correctly.

## What Happens Next

When Convoso sends call data:
1. Your webhook receives the call details
2. The system creates/updates contact information
3. Call recording URL is stored for transcription
4. The call is queued for AI processing

## Data Flow

```
Convoso Call Completes
        ↓
Convoso sends POST to webhook
        ↓
Webhook validates secret
        ↓
Call data saved to database
        ↓
Recording queued for transcription
        ↓
AI analysis begins
```

## Troubleshooting

If calls aren't appearing:
1. Check webhook secret matches exactly
2. Verify webhook URL is correct
3. Check Convoso webhook logs for errors
4. Test with `scripts/test-webhook-local.js`

## Required Call Data from Convoso

Your webhook expects these fields:
- `lead_id` - Unique identifier for the lead
- `customer_phone` - Customer's phone number
- `started_at` - Call start time
- `ended_at` - Call end time
- `recording_url` - URL to the call recording (optional but recommended)
- `agent_id` - Agent identifier (optional)
- `agent_name` - Agent name (optional)
- `disposition` - Call outcome (optional)
- `campaign` - Campaign name (optional)