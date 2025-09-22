import { NextRequest, NextResponse } from 'next/server';
import { SSEManager } from '@/lib/sse';

export const dynamic = 'force-dynamic';

// GET /api/testing/stream/[suiteRunId] - SSE stream for test progress
export async function GET(
  req: NextRequest,
  { params }: { params: { suiteRunId: string } }
) {
  const { suiteRunId } = params;

  // Create a readable stream for SSE
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      // Add this connection to the SSE manager
      SSEManager.addConnection(`suite-run-${suiteRunId}`, controller);

      // Send initial connection message
      const message = `event: connected\ndata: ${JSON.stringify({
        message: 'Connected to test progress stream',
        suite_run_id: suiteRunId
      })}\n\n`;
      controller.enqueue(encoder.encode(message));

      // Keep alive interval
      const keepAliveInterval = setInterval(() => {
        try {
          const pingMessage = `event: ping\ndata: ${JSON.stringify({
            timestamp: new Date().toISOString()
          })}\n\n`;
          controller.enqueue(encoder.encode(pingMessage));
        } catch (error) {
          clearInterval(keepAliveInterval);
          SSEManager.removeConnection(`suite-run-${suiteRunId}`, controller);
        }
      }, 30000); // Ping every 30 seconds

      // Clean up on close
      req.signal.addEventListener('abort', () => {
        clearInterval(keepAliveInterval);
        SSEManager.removeConnection(`suite-run-${suiteRunId}`, controller);
        controller.close();
      });
    },

    cancel() {
      // Cleanup when the stream is cancelled
      console.log(`[SSE] Stream cancelled for suite run ${suiteRunId}`);
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable Nginx buffering
    }
  });
}