import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/server/db';

export const dynamic = 'force-dynamic';

// THIS IS A DANGEROUS ENDPOINT - ONLY FOR TESTING
// Add authentication in production!
export async function POST(req: NextRequest) {
  try {
    const { table } = await req.json();
    
    // Only allow clearing specific tables
    const allowedTables = ['call_events', 'webhook_logs'];
    
    if (!allowedTables.includes(table)) {
      return NextResponse.json({
        ok: false,
        error: `Table ${table} is not allowed to be cleared`
      }, { status: 400 });
    }
    
    // Special handling for webhook_logs (stored in call_events)
    if (table === 'webhook_logs') {
      await db.none(`
        DELETE FROM call_events 
        WHERE type = 'webhook_received'
          AND payload->>'test' = 'true'
      `);
    } else {
      // For other tables, only delete test data
      await db.none(`
        DELETE FROM ${table}
        WHERE payload->>'test' = 'true'
      `);
    }
    
    return NextResponse.json({
      ok: true,
      message: `Test data cleared from ${table}`
    });
    
  } catch (error: any) {
    console.error('Clear data error:', error);
    return NextResponse.json({
      ok: false,
      error: error.message
    }, { status: 500 });
  }
}