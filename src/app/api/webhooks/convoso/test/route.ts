import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    // Generate test call data
    const testCall = {
      call_id: crypto.randomUUID(),
      convoso_call_id: `TEST-${Date.now()}`,
      lead_id: crypto.randomUUID(),
      agent_id: `agent-${Math.floor(Math.random() * 100)}`,
      agent_name: `Test Agent ${Math.floor(Math.random() * 10)}`,
      phone_number: `555-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`,
      campaign: 'Test Campaign',
      disposition: ['SALE', 'NO_ANSWER', 'CALLBACK', 'NOT_INTERESTED'][Math.floor(Math.random() * 4)],
      direction: 'outbound',
      duration: Math.floor(Math.random() * 300) + 30, // 30-330 seconds
      recording_url: Math.random() > 0.5 ? `https://example.com/recording-${Date.now()}.mp3` : null,
      started_at: new Date(Date.now() - 600000).toISOString(), // 10 minutes ago
      ended_at: new Date().toISOString(),
      test: true
    };

    // Send to the actual webhook endpoint
    const webhookUrl = new URL('/api/webhooks/convoso', req.url);
    const response = await fetch(webhookUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Test-Request': 'true'
      },
      body: JSON.stringify(testCall)
    });

    const result = await response.json();

    return NextResponse.json({
      ok: true,
      message: 'Test call webhook sent',
      test_data: testCall,
      webhook_response: result,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('Test webhook error:', error);
    return NextResponse.json({
      ok: false,
      error: error.message
    }, { status: 500 });
  }
}