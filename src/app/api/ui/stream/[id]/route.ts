import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const callId = params.id;
  
  // Create a ReadableStream for SSE
  const readable = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      
      // Send initial connection message
      controller.enqueue(encoder.encode(`event: connected\ndata: {"callId":"${callId}"}\n\n`));
      
      // Keep connection alive with heartbeat
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`:heartbeat\n\n`));
        } catch {
          clearInterval(heartbeat);
        }
      }, 30000);
      
      // Clean up on abort
      req.signal.addEventListener('abort', () => {
        clearInterval(heartbeat);
        controller.close();
      });
    },
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}