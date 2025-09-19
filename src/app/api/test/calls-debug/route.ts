import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    // Check authentication
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    // Test 1: Direct database query (bypasses RLS)
    const directCalls = await db.manyOrNone(`
      SELECT
        c.id,
        c.source,
        c.agent_name,
        c.created_at,
        c.phone_number
      FROM calls c
      ORDER BY c.created_at DESC
      LIMIT 10
    `);

    // Test 2: Count total calls
    const totalCount = await db.one(`
      SELECT COUNT(*) as count FROM calls
    `);

    // Test 3: Try both API endpoints
    let apiCallsSimple = null;
    let apiCalls = null;

    try {
      const response1 = await fetch(`${req.nextUrl.origin}/api/admin/calls-simple`, {
        headers: {
          cookie: req.headers.get('cookie') || ''
        }
      });
      apiCallsSimple = await response1.json();
    } catch (e: any) {
      apiCallsSimple = { error: e.message };
    }

    try {
      const response2 = await fetch(`${req.nextUrl.origin}/api/admin/calls`, {
        headers: {
          cookie: req.headers.get('cookie') || ''
        }
      });
      apiCalls = await response2.json();
    } catch (e: any) {
      apiCalls = { error: e.message };
    }

    // Test 4: Check RLS on calls table
    let rlsStatus = null;
    try {
      const { data: supabaseCalls, error } = await supabase
        .from('calls')
        .select('*')
        .limit(5);

      rlsStatus = {
        hasRLS: error?.message?.includes('RLS') || false,
        error: error?.message,
        dataCount: supabaseCalls?.length || 0
      };
    } catch (e: any) {
      rlsStatus = { error: e.message };
    }

    return NextResponse.json({
      ok: true,
      user: {
        id: user?.id,
        email: user?.email,
        authenticated: !!user
      },
      database: {
        totalCalls: parseInt(totalCount.count),
        sampleCalls: directCalls.slice(0, 3),
        directQueryWorks: directCalls.length > 0
      },
      apiEndpoints: {
        callsSimple: {
          ok: apiCallsSimple?.ok,
          dataCount: apiCallsSimple?.data?.length || 0,
          error: apiCallsSimple?.error
        },
        calls: {
          ok: apiCalls?.ok,
          dataCount: apiCalls?.data?.length || 0,
          error: apiCalls?.error
        }
      },
      supabaseRLS: rlsStatus,
      debug: {
        timestamp: new Date().toISOString()
      }
    });
  } catch (error: any) {
    return NextResponse.json({
      ok: false,
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
}