import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

// Test endpoint to verify webhook is reachable
export async function GET(req: NextRequest) {
  return NextResponse.json({
    ok: true,
    message: 'Webhook endpoint is reachable',
    endpoints: {
      convoso: '/api/webhooks/convoso',
      test: '/api/webhooks/test',
      manual: '/api/webhooks/test (POST)'
    },
    instructions: 'Configure Convoso to send webhooks to: https://synced-up-call-ai.vercel.app/api/webhooks/convoso'
  });
}

// Manual test to simulate a Convoso webhook
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    // Create a test webhook payload
    const testPayload = {
      call_id: body.call_id || crypto.randomUUID(),
      lead_id: body.lead_id || crypto.randomUUID(),
      agent_id: body.agent_id || 'agent-test',
      agent_name: body.agent_name || 'Test Agent',
      customer_phone: body.customer_phone || '+15551234567',
      campaign: body.campaign || 'TEST-CAMPAIGN',
      disposition: body.disposition || 'Completed',
      started_at: body.started_at || new Date().toISOString(),
      ended_at: body.ended_at || new Date().toISOString(),
      duration_sec: body.duration_sec || 120,
      recording_url: body.recording_url || 'https://example.com/test-recording.mp3',
      direction: body.direction || 'outbound'
    };

    // Forward to the actual webhook handler
    const response = await fetch(`${req.nextUrl.origin}/api/webhooks/convoso`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-convoso-signature': process.env.CONVOSO_WEBHOOK_SECRET || 'test-secret'
      },
      body: JSON.stringify(testPayload)
    });

    const result = await response.text();
    
    return NextResponse.json({
      ok: response.ok,
      status: response.status,
      payload_sent: testPayload,
      response: result,
      message: response.ok ? 'Test webhook sent successfully' : 'Webhook failed',
      check_at: 'https://synced-up-call-ai.vercel.app/api/ui/calls'
    }, { status: response.status });

  } catch (error: any) {
    return NextResponse.json({
      ok: false,
      error: error.message || 'Test failed'
    }, { status: 500 });
  }
}