import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';

export const dynamic = 'force-dynamic';

// GET endpoint to analyze what Convoso is sending
export async function GET(req: NextRequest) {
  try {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Get sample of recent webhook payloads
    const recentWebhooks = await db.manyOrNone(`
      SELECT
        id,
        call_id,
        type,
        payload,
        at as timestamp
      FROM call_events
      WHERE type IN ('webhook_received', 'lead_webhook_received')
        AND at >= $1
      ORDER BY at DESC
      LIMIT 100
    `, [oneHourAgo]);

    // Analyze payload structure
    const payloadAnalysis: any = {
      totalReceived: recentWebhooks.length,
      types: {},
      fields: new Set(),
      samples: [],
      agentActivity: {},
      dispositions: {},
      campaigns: {},
      phoneNumbers: new Set(),
      leadIds: new Set(),
      hasRecordingUrls: 0,
      missingRecordingUrls: 0,
      timeRange: {
        from: recentWebhooks.length > 0 ? recentWebhooks[recentWebhooks.length - 1].timestamp : null,
        to: recentWebhooks.length > 0 ? recentWebhooks[0].timestamp : null
      }
    };

    // Process each webhook
    recentWebhooks.forEach(webhook => {
      const payload = webhook.payload;

      // Count types
      payloadAnalysis.types[webhook.type] = (payloadAnalysis.types[webhook.type] || 0) + 1;

      // Track all fields we're receiving
      if (payload) {
        Object.keys(payload).forEach(key => {
          payloadAnalysis.fields.add(key);
        });

        // Track agents
        if (payload.agent_name) {
          payloadAnalysis.agentActivity[payload.agent_name] =
            (payloadAnalysis.agentActivity[payload.agent_name] || 0) + 1;
        }

        // Track dispositions
        if (payload.disposition) {
          payloadAnalysis.dispositions[payload.disposition] =
            (payloadAnalysis.dispositions[payload.disposition] || 0) + 1;
        }

        // Track campaigns
        if (payload.campaign) {
          payloadAnalysis.campaigns[payload.campaign] =
            (payloadAnalysis.campaigns[payload.campaign] || 0) + 1;
        }

        // Track phone numbers and lead IDs
        if (payload.phone_number) {
          payloadAnalysis.phoneNumbers.add(payload.phone_number);
        }
        if (payload.lead_id) {
          payloadAnalysis.leadIds.add(payload.lead_id);
        }

        // Check for recording URLs
        if (payload.recording_url) {
          payloadAnalysis.hasRecordingUrls++;
        } else {
          payloadAnalysis.missingRecordingUrls++;
        }

        // Add samples (first 5)
        if (payloadAnalysis.samples.length < 5) {
          payloadAnalysis.samples.push({
            id: webhook.id,
            call_id: webhook.call_id,
            type: webhook.type,
            timestamp: webhook.timestamp,
            payload: payload
          });
        }
      }
    });

    // Convert Sets to counts
    payloadAnalysis.uniquePhoneNumbers = payloadAnalysis.phoneNumbers.size;
    payloadAnalysis.uniqueLeadIds = payloadAnalysis.leadIds.size;
    payloadAnalysis.fieldsReceived = Array.from(payloadAnalysis.fields).sort();
    delete payloadAnalysis.phoneNumbers;
    delete payloadAnalysis.leadIds;
    delete payloadAnalysis.fields;

    // Get statistics over different time periods
    const stats = await db.one(`
      SELECT
        COUNT(*) FILTER (WHERE at >= $1 AND type = 'lead_webhook_received') as leads_last_hour,
        COUNT(*) FILTER (WHERE at >= $1 AND type = 'webhook_received') as calls_last_hour,
        COUNT(*) FILTER (WHERE at >= $2 AND type = 'lead_webhook_received') as leads_last_day,
        COUNT(*) FILTER (WHERE at >= $2 AND type = 'webhook_received') as calls_last_day,
        COUNT(*) FILTER (WHERE type = 'lead_webhook_received') as total_leads,
        COUNT(*) FILTER (WHERE type = 'webhook_received') as total_calls,
        COUNT(DISTINCT payload->>'lead_id') FILTER (WHERE at >= $1) as unique_leads_last_hour,
        COUNT(DISTINCT payload->>'agent_name') FILTER (WHERE at >= $1) as unique_agents_last_hour,
        COUNT(DISTINCT payload->>'campaign') FILTER (WHERE at >= $1) as unique_campaigns_last_hour
      FROM call_events
      WHERE type IN ('webhook_received', 'lead_webhook_received')
    `, [oneHourAgo, oneDayAgo]);

    // Check what data is missing
    const missingData = await db.one(`
      SELECT
        COUNT(*) FILTER (WHERE payload->>'duration' IS NULL) as missing_duration,
        COUNT(*) FILTER (WHERE payload->>'recording_url' IS NULL) as missing_recording,
        COUNT(*) FILTER (WHERE payload->>'disposition' IS NULL) as missing_disposition,
        COUNT(*) FILTER (WHERE payload->>'agent_name' IS NULL) as missing_agent,
        COUNT(*) FILTER (WHERE payload->>'started_at' IS NULL) as missing_start_time,
        COUNT(*) FILTER (WHERE payload->>'ended_at' IS NULL) as missing_end_time
      FROM call_events
      WHERE type IN ('webhook_received', 'lead_webhook_received')
        AND at >= $1
    `, [oneHourAgo]);

    // Get the most recent call with full data
    const lastCompleteCall = await db.oneOrNone(`
      SELECT
        id,
        call_id,
        payload,
        at as timestamp
      FROM call_events
      WHERE type = 'webhook_received'
        AND payload->>'duration' IS NOT NULL
        AND payload->>'recording_url' IS NOT NULL
      ORDER BY at DESC
      LIMIT 1
    `);

    return NextResponse.json({
      ok: true,
      timestamp: now.toISOString(),
      summary: {
        status: 'RECEIVING LEAD DATA ONLY - NO CALL DATA',
        lastHour: {
          leads: parseInt(stats.leads_last_hour),
          calls: parseInt(stats.calls_last_hour),
          uniqueLeads: parseInt(stats.unique_leads_last_hour),
          uniqueAgents: parseInt(stats.unique_agents_last_hour),
          uniqueCampaigns: parseInt(stats.unique_campaigns_last_hour)
        },
        lastDay: {
          leads: parseInt(stats.leads_last_day),
          calls: parseInt(stats.calls_last_day)
        },
        allTime: {
          totalLeads: parseInt(stats.total_leads),
          totalCalls: parseInt(stats.total_calls)
        }
      },
      dataReceived: {
        fieldsFromConvoso: payloadAnalysis.fieldsReceived,
        webhookTypes: payloadAnalysis.types,
        timeRange: payloadAnalysis.timeRange,
        uniquePhoneNumbers: payloadAnalysis.uniquePhoneNumbers,
        uniqueLeadIds: payloadAnalysis.uniqueLeadIds
      },
      missingData: {
        noCallDuration: parseInt(missingData.missing_duration),
        noRecordingUrl: parseInt(missingData.missing_recording),
        noDisposition: parseInt(missingData.missing_disposition),
        noAgentName: parseInt(missingData.missing_agent),
        noStartTime: parseInt(missingData.missing_start_time),
        noEndTime: parseInt(missingData.missing_end_time)
      },
      agentActivity: payloadAnalysis.agentActivity,
      dispositions: payloadAnalysis.dispositions,
      campaigns: payloadAnalysis.campaigns,
      recordingStatus: {
        withRecording: payloadAnalysis.hasRecordingUrls,
        withoutRecording: payloadAnalysis.missingRecordingUrls
      },
      lastCompleteCallData: lastCompleteCall ? {
        receivedAt: lastCompleteCall.timestamp,
        callId: lastCompleteCall.call_id,
        data: lastCompleteCall.payload
      } : null,
      samplePayloads: payloadAnalysis.samples,
      recommendations: [
        stats.calls_last_hour === '0' ? '🚨 CRITICAL: Not receiving CALL webhooks - only LEAD updates' : null,
        stats.calls_last_hour === '0' ? '📞 Enable "Call End" webhooks in Convoso settings' : null,
        stats.calls_last_hour === '0' ? '🎙️ Enable "Recording Ready" webhooks in Convoso settings' : null,
        missingData.missing_duration > 0 ? '⏱️ Call duration data is missing' : null,
        missingData.missing_recording > 0 ? '🎵 Recording URLs are not being sent' : null,
        'ℹ️ Current webhook URL: /api/webhooks/convoso'
      ].filter(Boolean)
    });

  } catch (error: any) {
    console.error('[WEBHOOK REPORT] Error:', error);
    return NextResponse.json({
      ok: false,
      error: error.message
    }, { status: 500 });
  }
}