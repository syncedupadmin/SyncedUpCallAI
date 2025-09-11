import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/server/db';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Generate a unique call ID
function generateCallId(): string {
  return crypto.randomUUID();
}

// Verify webhook signature (if configured)
function verifySignature(req: NextRequest, body: string): boolean {
  const secret = process.env.CONVOSO_WEBHOOK_SECRET;
  if (!secret) {
    console.log('[Webhook] No CONVOSO_WEBHOOK_SECRET configured, skipping verification');
    return true; // Allow if no secret is configured (development)
  }

  const signature = req.headers.get('x-convoso-signature');
  if (!signature) {
    console.log('[Webhook] No signature provided in x-convoso-signature header');
    return false;
  }

  // Convoso might use HMAC-SHA256 or simple string comparison
  // Adjust based on their documentation
  return signature === secret;
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  let callId: string | null = null;

  try {
    // Get raw body for signature verification
    const body = await req.text();
    
    // Verify webhook signature
    if (!verifySignature(req, body)) {
      console.log('[Webhook] Invalid signature');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse webhook payload
    const data = JSON.parse(body);
    console.log('[Webhook] Received Convoso webhook:', {
      call_id: data.call_id,
      disposition: data.disposition,
      duration: data.duration_sec,
      has_recording: !!data.recording_url
    });

    // Generate or use provided call ID
    callId = data.call_id || generateCallId();

    // Store webhook event
    await db.none(`
      INSERT INTO call_events (call_id, type, payload, created_at)
      VALUES ($1, $2, $3, NOW())
    `, [callId, 'webhook_received', data]);

    // Check if call already exists
    const existingCall = await db.oneOrNone(`
      SELECT id FROM calls WHERE id = $1
    `, [callId]);

    if (existingCall) {
      // Update existing call
      await db.none(`
        UPDATE calls SET
          recording_url = COALESCE($2, recording_url),
          disposition = COALESCE($3, disposition),
          duration_sec = COALESCE($4, duration_sec),
          campaign = COALESCE($5, campaign),
          direction = COALESCE($6, direction),
          ended_at = COALESCE($7, ended_at)
        WHERE id = $1
      `, [
        callId,
        data.recording_url,
        data.disposition,
        data.duration_sec || data.duration,
        data.campaign,
        data.direction || 'outbound',
        data.ended_at || data.end_time
      ]);

      console.log(`[Webhook] Updated existing call ${callId}`);
    } else {
      // Create new call record
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
        'convoso',
        data.convoso_call_id || data.call_id,
        data.campaign,
        data.disposition || 'Unknown',
        data.direction || 'outbound',
        data.started_at || data.start_time || new Date().toISOString(),
        data.ended_at || data.end_time,
        data.duration_sec || data.duration || 0,
        data.recording_url
      ]);

      console.log(`[Webhook] Created new call ${callId}`);
    }

    // If there's a recording URL, queue for transcription
    if (data.recording_url) {
      console.log(`[Webhook] Queueing transcription for ${callId}`);
      
      // Queue transcription job
      await db.none(`
        INSERT INTO call_events (call_id, type, payload, created_at)
        VALUES ($1, 'transcription_queued', $2, NOW())
      `, [callId, { recording_url: data.recording_url }]);

      // Optionally trigger transcription immediately
      // Note: In production, this should be handled by a background job
      if (process.env.AUTO_TRANSCRIBE === 'true') {
        try {
          const jobsSecret = process.env.JOBS_SECRET;
          if (jobsSecret) {
            const response = await fetch(`${req.nextUrl.origin}/api/jobs/transcribe?secret=${jobsSecret}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                id: callId,
                audioUrl: data.recording_url
              })
            });
            
            if (response.ok) {
              console.log(`[Webhook] Transcription job triggered for ${callId}`);
            } else {
              console.log(`[Webhook] Failed to trigger transcription: ${response.status}`);
            }
          }
        } catch (error) {
          console.error(`[Webhook] Error triggering transcription:`, error);
        }
      }
    }

    const processingTime = Date.now() - startTime;
    console.log(`[Webhook] Processed in ${processingTime}ms`);

    return NextResponse.json({
      ok: true,
      call_id: callId,
      processed_in_ms: processingTime
    });

  } catch (error: any) {
    console.error('[Webhook] Error processing webhook:', error);
    
    // Store error event
    if (callId) {
      try {
        await db.none(`
          INSERT INTO call_events (call_id, type, payload, created_at)
          VALUES ($1, 'webhook_error', $2, NOW())
        `, [callId, { error: error.message }]);
      } catch (eventError) {
        console.error('[Webhook] Failed to store error event:', eventError);
      }
    }

    return NextResponse.json({
      ok: false,
      error: error.message || 'Webhook processing failed'
    }, { status: 500 });
  }
}

// GET endpoint for testing/verification
export async function GET(req: NextRequest) {
  return NextResponse.json({
    ok: true,
    message: 'Convoso webhook endpoint is active',
    configuration: {
      webhook_url: 'https://synced-up-call-ai.vercel.app/api/webhooks/convoso',
      method: 'POST',
      headers_required: {
        'Content-Type': 'application/json',
        'x-convoso-signature': 'Your webhook secret (optional)'
      },
      secret_configured: !!process.env.CONVOSO_WEBHOOK_SECRET,
      auto_transcribe: process.env.AUTO_TRANSCRIBE === 'true'
    }
  });
}