import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';

export const dynamic = 'force-dynamic';

// SSE helper to format messages
function formatSSE(data: any): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function GET(req: NextRequest) {
  const callId = req.nextUrl.searchParams.get('id');
  
  if (!callId) {
    return NextResponse.json({ error: 'Missing call ID' }, { status: 400 });
  }

  // Create a TransformStream for SSE
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  // Start the SSE response
  const response = new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });

  // Poll for updates in the background
  (async () => {
    try {
      let lastStatus = '';
      let retries = 0;
      const maxRetries = 60; // 60 seconds max

      while (retries < maxRetries) {
        // Get current call status
        const call = await db.oneOrNone(`
          SELECT 
            c.id,
            c.disposition,
            CASE 
              WHEN a.call_id IS NOT NULL THEN 'done'
              WHEN e.call_id IS NOT NULL THEN 'analyzing'
              WHEN t.call_id IS NOT NULL THEN 'embedding'
              WHEN c.recording_url IS NOT NULL THEN 'transcribing'
              ELSE 'queued'
            END as status,
            t.call_id IS NOT NULL as has_transcript,
            e.call_id IS NOT NULL as has_embedding,
            a.call_id IS NOT NULL as has_analysis
          FROM calls c
          LEFT JOIN transcripts t ON t.call_id = c.id
          LEFT JOIN transcript_embeddings e ON e.call_id = c.id
          LEFT JOIN analyses a ON a.call_id = c.id
          WHERE c.id = $1
        `, [callId]);

        if (!call) {
          await writer.write(encoder.encode(formatSSE({
            status: 'error',
            message: 'Call not found'
          })));
          break;
        }

        // Send update if status changed
        if (call.status !== lastStatus) {
          await writer.write(encoder.encode(formatSSE({
            status: call.status,
            progress: {
              queued: ['queued', 'transcribing', 'embedding', 'analyzing', 'done'].includes(call.status),
              transcribing: ['transcribing', 'embedding', 'analyzing', 'done'].includes(call.status),
              embedding: ['embedding', 'analyzing', 'done'].includes(call.status),
              analyzing: ['analyzing', 'done'].includes(call.status),
              done: call.status === 'done'
            },
            has_transcript: call.has_transcript,
            has_embedding: call.has_embedding,
            has_analysis: call.has_analysis
          })));
          
          lastStatus = call.status;
          
          // If done, send final message and close
          if (call.status === 'done') {
            await writer.write(encoder.encode(formatSSE({
              status: 'complete',
              message: 'Processing complete'
            })));
            break;
          }
        }

        // Wait 1 second before next check
        await new Promise(resolve => setTimeout(resolve, 1000));
        retries++;
      }

      // Send timeout message if max retries reached
      if (retries >= maxRetries) {
        await writer.write(encoder.encode(formatSSE({
          status: 'timeout',
          message: 'Progress check timed out after 60 seconds'
        })));
      }

    } catch (error) {
      console.error('[SSE] Error:', error);
      await writer.write(encoder.encode(formatSSE({
        status: 'error',
        message: 'Internal server error'
      })));
    } finally {
      await writer.close();
    }
  })();

  return response;
}