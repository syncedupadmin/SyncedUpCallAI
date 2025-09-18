import { NextRequest, NextResponse } from 'next/server';
import { ConvosoService } from '@/src/lib/convoso-service';

export const dynamic = 'force-dynamic';

// TEMPORARY TEST ENDPOINT WITHOUT AUTH
export async function GET(req: NextRequest) {
  try {
    console.log('[NOAUTH Search] Starting search without authentication checks...');

    const searchParams = req.nextUrl.searchParams;
    const dateFrom = searchParams.get('dateFrom') || '2025-09-17';
    const dateTo = searchParams.get('dateTo') || '2025-09-18';

    console.log(`[NOAUTH Search] Searching from ${dateFrom} to ${dateTo}`);

    const service = new ConvosoService();

    // Fetch complete call data (recordings + lead info)
    const allCalls = await service.fetchCompleteCallData(dateFrom, dateTo);

    // Filter out 0-second calls (abandoned/failed) and Auto-Detected (no agent) calls
    const calls = allCalls.filter(call =>
      call.duration_seconds > 0 &&
      call.agent_name !== 'Auto-Detected'
    );

    // Get filter options from the results
    const filterOptions = service.getFilterOptions(calls);

    // Sort by start_time descending by default
    calls.sort((a, b) =>
      new Date(b.start_time).getTime() - new Date(a.start_time).getTime()
    );

    console.log(`[NOAUTH Search] Found ${calls.length} calls`);

    return NextResponse.json({
      success: true,
      calls,
      filterOptions,
      total: calls.length,
      dateRange: {
        from: dateFrom,
        to: dateTo
      },
      message: 'WARNING: This is a test endpoint without authentication!'
    });

  } catch (error: any) {
    console.error('[NOAUTH Search] Error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}