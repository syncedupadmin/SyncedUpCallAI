import { NextRequest, NextResponse } from 'next/server';
import { ConvosoService } from '@/lib/convoso-service';

export const dynamic = 'force-dynamic';

// Test endpoint without authentication to debug the search
export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const dateFrom = searchParams.get('dateFrom') || '2025-09-17';
    const dateTo = searchParams.get('dateTo') || '2025-09-18';

    console.log(`[TEST Search API] Searching from ${dateFrom} to ${dateTo}`);

    const service = new ConvosoService();

    // Test 1: Fetch recordings
    console.log('[TEST] Step 1: Fetching recordings...');
    const recordings = await service.fetchRecordings(dateFrom, dateTo);
    console.log(`[TEST] Found ${recordings.length} recordings`);

    if (recordings.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'No recordings found',
        dateRange: { from: dateFrom, to: dateTo },
        step: 'fetchRecordings',
        debug: {
          auth_token: process.env.CONVOSO_AUTH_TOKEN ? 'Set' : 'Missing',
          api_base: process.env.CONVOSO_API_BASE || 'https://api.convoso.com/v1'
        }
      });
    }

    // Test 2: Fetch lead data for first recording
    console.log('[TEST] Step 2: Testing lead data fetch...');
    const firstRecording = recordings[0];
    const leadData = await service.fetchLeadData(firstRecording.lead_id);

    if (!leadData) {
      console.log('[TEST] No lead data found for lead_id:', firstRecording.lead_id);
    }

    // Test 3: Combine data
    console.log('[TEST] Step 3: Combining data...');
    const combined = service.combineCallData(firstRecording, leadData);

    // Test 4: Get all complete call data
    console.log('[TEST] Step 4: Fetching complete call data...');
    const allCalls = await service.fetchCompleteCallData(dateFrom, dateTo);

    // Filter out 0-second calls
    const calls = allCalls.filter(call => call.duration_seconds > 0);

    // Get filter options
    const filterOptions = service.getFilterOptions(calls);

    // Sort by start_time descending
    calls.sort((a, b) =>
      new Date(b.start_time).getTime() - new Date(a.start_time).getTime()
    );

    console.log(`[TEST] Final result: ${calls.length} calls after filtering`);

    return NextResponse.json({
      success: true,
      recordings_count: recordings.length,
      calls_count: calls.length,
      filtered_count: calls.length,
      sample_recording: firstRecording,
      sample_lead: leadData,
      sample_combined: combined,
      calls: calls.slice(0, 10), // First 10 for testing
      filterOptions,
      dateRange: {
        from: dateFrom,
        to: dateTo
      }
    });

  } catch (error: any) {
    console.error('[TEST Search API] Error:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: error.stack,
      step: 'error'
    }, { status: 500 });
  }
}