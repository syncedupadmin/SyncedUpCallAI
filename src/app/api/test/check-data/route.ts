import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/server/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    // Get test records from the last hour
    const testContacts = await db.manyOrNone(`
      SELECT id, lead_id, phone_number, first_name, last_name, email, created_at
      FROM contacts
      WHERE lead_id LIKE 'TEST-%'
      ORDER BY created_at DESC
      LIMIT 10
    `);

    const testCalls = await db.manyOrNone(`
      SELECT id, call_id, lead_id, agent_name, disposition, duration, created_at
      FROM calls
      WHERE call_id LIKE 'TEST-%'
      ORDER BY created_at DESC
      LIMIT 10
    `);

    const pendingRecordings = await db.manyOrNone(`
      SELECT id, call_id, lead_id, attempts, created_at
      FROM pending_recordings
      WHERE (call_id LIKE 'TEST-%' OR lead_id LIKE 'TEST-%')
        AND processed_at IS NULL
      ORDER BY created_at DESC
      LIMIT 10
    `);

    return NextResponse.json({
      ok: true,
      test_contacts: testContacts.length,
      test_calls: testCalls.length,
      pending_recordings: pendingRecordings.length,
      data: {
        contacts: testContacts,
        calls: testCalls,
        pending: pendingRecordings
      }
    });
  } catch (error: any) {
    return NextResponse.json({
      ok: false,
      error: error.message
    }, { status: 500 });
  }
}