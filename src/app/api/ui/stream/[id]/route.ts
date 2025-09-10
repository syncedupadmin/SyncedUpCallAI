import { NextRequest } from 'next/server';
import { SSEManager } from '@/src/lib/sse';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const callId = params.id;
  
  // Create a TransformStream for SSE
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const encoder = new TextEncoder();

  // Send initial connection message
  writer.write(encoder.encode(`event: connected\ndata: {"callId":"${callId}"}\n\n`));

  // Register this connection
  SSEManager.addConnection(callId, stream.readable.getReader() as any);

  // Set up cleanup on disconnect
  req.signal.addEventListener('abort', () => {
    SSEManager.removeConnection(callId, stream.readable.getReader() as any);
    writer.close();
  });

  // Keep connection alive with heartbeat
  const heartbeat = setInterval(() => {
    try {
      writer.write(encoder.encode(`:heartbeat\n\n`));
    } catch {
      clearInterval(heartbeat);
    }
  }, 30000);

  // Clean up on connection close
  stream.readable.pipeTo(new WritableStream({
    close() {
      clearInterval(heartbeat);
      SSEManager.removeConnection(callId, stream.readable.getReader() as any);
    }
  })).catch(() => {
    clearInterval(heartbeat);
  });

  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}