import { NextRequest, NextResponse } from 'next/server';
import { ConvosoService } from '@/lib/convoso-service';

export const dynamic = 'force-dynamic';

// TEMPORARY TEST ENDPOINT WITHOUT AUTH
export async function GET(req: NextRequest) {
  try {
    console.log('[NOAUTH Search] Starting search without authentication checks...');

    const searchParams = req.nextUrl.searchParams;

    // Use today as default date
    const today = new Date().toISOString().split('T')[0];
    const dateFrom = searchParams.get('dateFrom') || today;
    const dateTo = searchParams.get('dateTo') || today;

    console.log(`[NOAUTH Search] Searching from ${dateFrom} to ${dateTo}`);

    const service = new ConvosoService();

    // Track progress
    let fetchProgress = { fetched: 0, total: 0 };

    // Fetch complete call data (recordings + lead info) with progress tracking
    const allCalls = await service.fetchCompleteCallData(
      dateFrom,
      dateTo,
      (fetched, total) => {
        fetchProgress = { fetched, total };
        console.log(`[NOAUTH Search] Progress: ${fetched}/${total} calls fetched`);
      }
    );

    // NO FILTERS - let the UI handle all filtering
    const calls = allCalls;

    // Get filter options from the results
    const filterOptions = service.getFilterOptions(calls);

    // Sort by start_time descending by default
    calls.sort((a, b) =>
      new Date(b.start_time).getTime() - new Date(a.start_time).getTime()
    );

    console.log(`[NOAUTH Search] Completed: fetched ${calls.length} calls`);

    return NextResponse.json({
      success: true,
      calls,
      filterOptions,
      total: calls.length,
      pagination: {
        totalFound: fetchProgress.total,
        totalFetched: calls.length,
        complete: fetchProgress.fetched >= fetchProgress.total || calls.length === fetchProgress.total
      },
      dateRange: {
        from: dateFrom,
        to: dateTo
      },
      message: fetchProgress.total > 10000
        ? `Fetched all ${calls.length} calls using pagination (${Math.ceil(fetchProgress.total / 10000)} API requests)`
        : 'WARNING: This is a test endpoint without authentication!'
    });

  } catch (error: any) {
    console.error('[NOAUTH Search] Error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}