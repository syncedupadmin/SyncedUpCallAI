import { NextRequest, NextResponse } from 'next/server';
import { ConvosoSyncService } from '@/src/lib/convoso-sync';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // TEST ENDPOINT - No auth for debugging
  console.log('[TEST SYNC] Starting test sync...');

  try {
    // Check environment variables
    const envCheck = {
      CONVOSO_AUTH_TOKEN: !!process.env.CONVOSO_AUTH_TOKEN,
      SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    };

    console.log('[TEST SYNC] Environment check:', envCheck);

    if (!envCheck.CONVOSO_AUTH_TOKEN) {
      return NextResponse.json({
        ok: false,
        error: 'CONVOSO_AUTH_TOKEN is not set in environment variables',
        envCheck
      });
    }

    if (!envCheck.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({
        ok: false,
        error: 'SUPABASE_SERVICE_ROLE_KEY is not set in environment variables',
        envCheck
      });
    }

    const syncService = new ConvosoSyncService();
    console.log('[TEST SYNC] Service created, starting sync...');

    const result = await syncService.syncCalls(1);

    console.log('[TEST SYNC] Sync completed:', result);

    return NextResponse.json({
      ok: true,
      result,
      envCheck
    });

  } catch (error: any) {
    console.error('[TEST SYNC] Error:', error);
    return NextResponse.json({
      ok: false,
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
}