# KPI System Setup Guide

## 1. Navigation
The KPI dashboard is now available at `/kpi` and has been added to both:
- Super Admin navigation (`/superadmin` menu)
- Regular Admin navigation (`/admin` menu)

## 2. Setting Agency ID for KPI Dashboard

The KPI dashboard needs an agency ID to fetch the correct metrics. You can provide it in two ways:

### Option A: Via localStorage (Persistent)
```javascript
// Set once when user logs in or selects an agency
localStorage.setItem("agencyId", "your-agency-uuid-here");
```

### Option B: Via URL Query Parameter
```
/kpi?agencyId=your-agency-uuid-here
```

## 3. Ensuring Data Flows to KPI Tables

For KPIs to work, the analyze API must receive proper metadata. When calling `/api/analyze`, include:

```json
{
  "recording_url": "https://example.com/recording.mp3",
  "meta": {
    "call_id": "unique-call-id",
    "agency_id": "your-agency-uuid",
    "agent_id": "agent-name-or-id",
    "agent_name": "John Doe",
    "customer_first_name": "Jane",
    "customer_last_name": "Smith"
  }
}
```

## 4. Required Database Tables

The following tables must exist (created by migrations):
- `calls` - Stores analyzed call data
- `kpi_baselines` - Frozen baseline metrics
- `kpi_daily_agency` - Daily rollups per agency
- `kpi_daily_agent` - Daily rollups per agent
- `kpi_weekly_agency` - Weekly rollups per agency
- `kpi_weekly_agent` - Weekly rollups per agent

## 5. Cron Jobs

Set up these cron jobs in Vercel:
- `/api/cron/kpi-baseline` - Run once to establish baseline (manual)
- `/api/cron/kpi-daily` - Run daily at midnight UTC
- `/api/cron/kpi-weekly` - Run weekly on Monday at midnight UTC

## 6. Testing the System

1. **Set a test agency ID:**
```javascript
localStorage.setItem("agencyId", "00000000-0000-0000-0000-000000000000");
```

2. **Analyze a call with metadata:**
```bash
curl -X POST https://your-app.vercel.app/api/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "recording_url": "https://example.com/test.mp3",
    "meta": {
      "call_id": "test-001",
      "agency_id": "00000000-0000-0000-0000-000000000000",
      "agent_id": "agent-001"
    }
  }'
```

3. **Check if data is flowing:**
```sql
-- Check calls table
SELECT id, agency_id, agent_id, analyzed_day
FROM calls
WHERE agency_id IS NOT NULL
ORDER BY analyzed_at DESC
LIMIT 5;

-- Check daily KPIs
SELECT * FROM kpi_daily_agency
WHERE agency_id = 'your-agency-id'
ORDER BY day DESC
LIMIT 5;
```

4. **Visit the KPI dashboard:**
Navigate to `/kpi` to see the metrics and deltas.

## 7. Troubleshooting

- **No baseline data:** Run `/api/cron/kpi-baseline?agencyId=your-agency-id` once
- **No daily data:** Check if calls have `agency_id` and `agent_id` populated
- **KPI page shows "No data":** Verify agency ID is set correctly in localStorage or URL
- **Deltas not showing:** Ensure baseline exists for the agency

## 8. Example Integration

Here's how to integrate with your existing Convoso webhook:

```typescript
// In your webhook handler
const meta = {
  call_id: webhookData.call_id,
  agency_id: "your-fixed-agency-uuid", // Or map from office_id
  agent_id: webhookData.agent_name || webhookData.agent_id,
  agent_name: webhookData.agent_name,
  customer_first_name: webhookData.first_name,
  customer_last_name: webhookData.last_name,
  call_type: webhookData.direction // "inbound" or "outbound"
};

// Send to analyze
await fetch('/api/analyze', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    recording_url: webhookData.recording_url,
    meta
  })
});
```