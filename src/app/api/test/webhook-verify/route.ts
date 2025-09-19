import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';

export const dynamic = 'force-dynamic';

// Test and verify webhook functionality
export async function POST(req: NextRequest) {
  try {
    const { type, test_data } = await req.json();

    if (!type || !['lead', 'call'].includes(type)) {
      return NextResponse.json({
        ok: false,
        error: 'Type must be "lead" or "call"'
      }, { status: 400 });
    }

    // Generate test data based on type
    let testPayload: any;
    let webhookUrl: string;

    if (type === 'lead') {
      testPayload = test_data || {
        lead_id: `TEST-LEAD-${Date.now()}`,
        phone_number: '555-0100',
        first_name: 'Test',
        last_name: 'Lead',
        email: 'test@example.com',
        address: '123 Test St',
        city: 'Test City',
        state: 'TS',
        list_id: 'TEST-LIST-001'
      };
      webhookUrl = new URL('/api/webhooks/convoso-leads', req.url).toString();
    } else {
      testPayload = test_data || {
        call_id: `TEST-CALL-${Date.now()}`,
        lead_id: `TEST-LEAD-${Date.now()}`,
        agent_name: 'Test Agent',
        phone_number: '555-0200',
        disposition: 'TEST_CALL',
        duration: 120,
        campaign: 'Test Campaign',
        recording_url: null,
        started_at: new Date(Date.now() - 120000).toISOString(),
        ended_at: new Date().toISOString()
      };
      webhookUrl = new URL('/api/webhooks/convoso-calls', req.url).toString();
    }

    // Send test webhook
    const webhookResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Test-Request': 'true',
        ...(process.env.WEBHOOK_SECRET ? {
          'X-Webhook-Secret': process.env.WEBHOOK_SECRET
        } : {})
      },
      body: JSON.stringify(testPayload)
    });

    const webhookResult = await webhookResponse.json();

    // Verify data was saved
    let verificationResult: any = {};

    if (type === 'lead' && testPayload.lead_id) {
      const contact = await db.oneOrNone(`
        SELECT * FROM contacts WHERE lead_id = $1
      `, [testPayload.lead_id]);

      verificationResult = {
        saved: !!contact,
        contact_id: contact?.id,
        data_matches: contact ? {
          phone: contact.phone_number === testPayload.phone_number,
          email: contact.email === testPayload.email,
          name: contact.first_name === testPayload.first_name &&
                contact.last_name === testPayload.last_name
        } : null
      };
    } else if (type === 'call' && testPayload.call_id) {
      const call = await db.oneOrNone(`
        SELECT * FROM calls WHERE call_id = $1
      `, [testPayload.call_id]);

      verificationResult = {
        saved: !!call,
        call_record_id: call?.id,
        data_matches: call ? {
          agent: call.agent_name === testPayload.agent_name,
          disposition: call.disposition === testPayload.disposition,
          duration: call.duration === testPayload.duration
        } : null
      };

      // Check if recording was queued
      if (!testPayload.recording_url) {
        const pendingRecording = await db.oneOrNone(`
          SELECT * FROM pending_recordings
          WHERE call_id = $1 OR lead_id = $2
        `, [testPayload.call_id, testPayload.lead_id]);

        verificationResult.recording_queued = !!pendingRecording;
      }
    }

    // Check webhook logs
    const webhookLog = await db.oneOrNone(`
      SELECT * FROM webhook_logs
      WHERE endpoint = $1
      ORDER BY created_at DESC
      LIMIT 1
    `, [type === 'lead' ? '/api/webhooks/convoso-leads' : '/api/webhooks/convoso-calls']);

    return NextResponse.json({
      ok: true,
      test_type: type,
      test_payload: testPayload,
      webhook_response: {
        status: webhookResponse.status,
        ok: webhookResponse.ok,
        result: webhookResult
      },
      verification: verificationResult,
      webhook_logged: !!webhookLog,
      webhook_log_id: webhookLog?.id,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    return NextResponse.json({
      ok: false,
      error: error.message
    }, { status: 500 });
  }
}

// GET endpoint to check recent webhook activity
export async function GET(req: NextRequest) {
  try {
    // Get recent contacts
    const recentContacts = await db.manyOrNone(`
      SELECT lead_id, phone_number, first_name, last_name, created_at
      FROM contacts
      ORDER BY created_at DESC
      LIMIT 5
    `);

    // Get recent calls
    const recentCalls = await db.manyOrNone(`
      SELECT call_id, lead_id, agent_name, disposition, duration, created_at
      FROM calls
      ORDER BY created_at DESC
      LIMIT 5
    `);

    // Get recent webhook logs
    const recentLogs = await db.manyOrNone(`
      SELECT endpoint, response_status, error, created_at
      FROM webhook_logs
      ORDER BY created_at DESC
      LIMIT 10
    `).catch(() => []);

    // Get pending recordings count
    const pendingRecordings = await db.oneOrNone(`
      SELECT COUNT(*) as count
      FROM pending_recordings
      WHERE processed_at IS NULL
    `).catch(() => ({ count: 0 }));

    // Get stats
    const stats = await db.oneOrNone(`
      SELECT
        (SELECT COUNT(*) FROM contacts) as total_contacts,
        (SELECT COUNT(*) FROM calls) as total_calls,
        (SELECT COUNT(*) FROM contacts WHERE created_at > NOW() - INTERVAL '24 hours') as contacts_24h,
        (SELECT COUNT(*) FROM calls WHERE created_at > NOW() - INTERVAL '24 hours') as calls_24h
    `);

    return NextResponse.json({
      ok: true,
      stats,
      recent_contacts: recentContacts,
      recent_calls: recentCalls,
      recent_webhook_logs: recentLogs,
      pending_recordings: pendingRecordings.count,
      endpoints: {
        leads: '/api/webhooks/convoso-leads',
        calls: '/api/webhooks/convoso-calls',
        test: '/api/test/webhook-verify'
      },
      instructions: {
        test_lead: 'POST /api/test/webhook-verify with { "type": "lead" }',
        test_call: 'POST /api/test/webhook-verify with { "type": "call" }',
        custom_test: 'Include "test_data" object with custom values'
      }
    });

  } catch (error: any) {
    return NextResponse.json({
      ok: false,
      error: error.message
    }, { status: 500 });
  }
}