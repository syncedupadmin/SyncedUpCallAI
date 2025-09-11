import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/src/server/db';

export const dynamic = 'force-dynamic';

// Simple test endpoint that directly creates a test call
export async function POST(req: NextRequest) {
  try {
    const callId = crypto.randomUUID();
    const now = new Date().toISOString();
    
    // Create a test call directly in the database
    await db.none(`
      INSERT INTO calls (
        id,
        source,
        source_ref,
        campaign,
        disposition,
        direction,
        started_at,
        ended_at,
        duration_sec,
        recording_url
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      callId,
      'test',
      'test-simple',
      'TEST-CAMPAIGN',
      'Test Call',
      'outbound',
      now,
      now,
      120,
      'https://example.com/test-recording.mp3'
    ]);

    // Log the test
    await db.none(`
      INSERT INTO call_events (call_id, type, payload, created_at)
      VALUES ($1, 'test_webhook', $2, NOW())
    `, [callId, { source: 'test-simple', timestamp: now }]);

    return NextResponse.json({
      ok: true,
      call_id: callId,
      message: 'Test call created successfully',
      view_at: `https://synced-up-call-ai.vercel.app/calls/${callId}`
    });

  } catch (error: any) {
    console.error('[Test-Simple] Error:', error);
    return NextResponse.json({
      ok: false,
      error: error.message || 'Test failed'
    }, { status: 500 });
  }
}

// GET endpoint to show instructions
export async function GET(req: NextRequest) {
  return NextResponse.json({
    ok: true,
    message: 'Simple test endpoint',
    usage: 'POST to this endpoint to create a test call record',
    curl_example: 'curl -X POST https://synced-up-call-ai.vercel.app/api/webhooks/test-simple'
  });
}