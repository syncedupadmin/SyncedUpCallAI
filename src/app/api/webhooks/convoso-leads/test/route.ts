import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { isAdminAuthenticated, unauthorizedResponse } from '@/src/server/auth/admin';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  // Disable in production unless explicitly enabled
  if (process.env.NODE_ENV === 'production' && process.env.ENABLE_TEST_ENDPOINTS !== 'true') {
    return NextResponse.json(
      { ok: false, error: 'Test endpoints disabled in production' },
      { status: 404 }
    );
  }

  // Require admin authentication
  if (!isAdminAuthenticated(req)) {
    return unauthorizedResponse();
  }

  try {
    // Generate test lead data
    const testLead = {
      lead_id: crypto.randomUUID(),
      owner_id: crypto.randomUUID(),
      first_name: 'Test',
      last_name: `Lead-${Date.now()}`,
      phone_number: `555-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`,
      email: `test${Date.now()}@example.com`,
      address: '123 Test Street',
      city: 'Test City',
      state: 'TS',
      zip: '12345',
      campaign: 'Test Campaign',
      created_at: new Date().toISOString(),
      test: true
    };

    // Send to the actual webhook endpoint
    const webhookUrl = new URL('/api/webhooks/convoso-leads', req.url);
    const response = await fetch(webhookUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Test-Request': 'true'
      },
      body: JSON.stringify(testLead)
    });

    const result = await response.json();

    return NextResponse.json({
      ok: true,
      message: 'Test lead webhook sent',
      test_data: testLead,
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