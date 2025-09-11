import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Echo endpoint to test webhook reception without database
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const headers = Object.fromEntries(req.headers.entries());
    
    console.log('[Echo Webhook] Received:', {
      method: 'POST',
      url: req.url,
      headers: headers,
      body: body,
      timestamp: new Date().toISOString()
    });
    
    return NextResponse.json({
      ok: true,
      message: 'Webhook received successfully',
      echo: {
        headers: headers,
        body: body,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error: any) {
    console.error('[Echo Webhook] Error:', error);
    return NextResponse.json({
      ok: false,
      error: error.message || 'Echo failed'
    }, { status: 500 });
  }
}

// GET endpoint to show info
export async function GET(req: NextRequest) {
  return NextResponse.json({
    ok: true,
    message: 'Echo webhook endpoint',
    usage: 'POST any JSON to this endpoint to echo it back',
    webhook_url: 'https://synced-up-call-ai.vercel.app/api/webhooks/echo',
    convoso_config: {
      webhook_url: 'https://synced-up-call-ai.vercel.app/api/webhooks/convoso',
      note: 'Configure Convoso to send webhooks to the /convoso endpoint'
    }
  });
}