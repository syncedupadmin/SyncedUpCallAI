import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';

export const dynamic = 'force-dynamic';

// GET endpoint to check webhook system status (per spec)
export async function GET(req: NextRequest) {
  try {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Get webhook statistics
    const stats = await db.one(`
      SELECT
        COUNT(*) FILTER (WHERE at >= $1) as last_hour,
        COUNT(*) FILTER (WHERE at >= $2) as last_day,
        COUNT(*) as total,
        MAX(at) as last_received,
        COUNT(*) FILTER (WHERE type = 'webhook_received' AND at >= $1) as calls_last_hour,
        COUNT(*) FILTER (WHERE type = 'lead_webhook_received' AND at >= $1) as leads_last_hour,
        COUNT(*) FILTER (WHERE type = 'webhook_echo' AND at >= $1) as echo_last_hour,
        COUNT(*) FILTER (WHERE type = 'quarantine' AND at >= $1) as quarantine_last_hour
      FROM call_events
      WHERE at >= $2
    `, [oneHourAgo, oneDayAgo]);

    // Get recent calls from Convoso
    const recentCalls = await db.manyOrNone(`
      SELECT
        id,
        source,
        started_at,
        agent_id,
        recording_url,
        disposition,
        created_at
      FROM calls
      WHERE source = 'convoso'
      ORDER BY created_at DESC
      LIMIT 5
    `);

    // Get recent webhook events
    const recentEvents = await db.manyOrNone(`
      SELECT
        id,
        call_id,
        type,
        at,
        payload->>'agent_name' as agent,
        payload->>'disposition' as disposition
      FROM call_events
      WHERE type IN ('webhook_received', 'lead_webhook_received', 'webhook_echo')
      ORDER BY at DESC
      LIMIT 10
    `);

    // Check database connectivity
    const dbCheck = await db.one(`SELECT NOW() as db_time, version() as pg_version`);

    // Calculate health status
    const minutesSinceLastWebhook = stats.last_received
      ? Math.floor((now.getTime() - new Date(stats.last_received).getTime()) / (1000 * 60))
      : null;

    const health = {
      status: minutesSinceLastWebhook === null ? 'no_data' :
              minutesSinceLastWebhook < 5 ? 'healthy' :
              minutesSinceLastWebhook < 30 ? 'warning' : 'critical',
      minutesSinceLastWebhook
    };

    return NextResponse.json({
      ok: true,
      timestamp: now.toISOString(),
      health,
      stats: {
        lastHour: stats.last_hour,
        lastDay: stats.last_day,
        total: stats.total,
        lastReceived: stats.last_received,
        breakdown: {
          calls: stats.calls_last_hour,
          leads: stats.leads_last_hour,
          echo: stats.echo_last_hour,
          quarantine: stats.quarantine_last_hour
        }
      },
      recentCalls: recentCalls.map(c => ({
        id: c.id,
        startedAt: c.started_at,
        hasRecording: !!c.recording_url,
        disposition: c.disposition,
        createdAt: c.created_at
      })),
      recentEvents: recentEvents.map(e => ({
        id: e.id,
        callId: e.call_id,
        type: e.type,
        timestamp: e.at,
        agent: e.agent,
        disposition: e.disposition
      })),
      database: {
        connected: true,
        time: dbCheck.db_time,
        version: dbCheck.pg_version
      },
      endpoints: {
        main: '/api/webhooks/convoso',
        strict: '/api/hooks/convoso',
        echo: '/api/webhooks/echo',
        status: '/api/webhooks/status'
      },
      instructions: {
        convoso_config: 'Configure Convoso to send webhooks to /api/webhooks/convoso',
        testing: 'Use /api/webhooks/echo to capture raw webhook data',
        monitoring: 'Check this endpoint regularly for system health'
      }
    });

  } catch (error: any) {
    console.error('[WEBHOOK STATUS] Error:', error);
    return NextResponse.json({
      ok: false,
      timestamp: new Date().toISOString(),
      error: error.message,
      database: {
        connected: false,
        error: error.message
      }
    }, { status: 500 });
  }
}