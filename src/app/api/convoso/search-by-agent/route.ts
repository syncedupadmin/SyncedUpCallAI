import { NextRequest, NextResponse } from 'next/server';

const CONVOSO_AUTH_TOKEN = process.env.CONVOSO_AUTH_TOKEN;
const CONVOSO_API_BASE = 'https://api.convoso.com/v1';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // 60 second timeout for large agent data

// Search for ALL calls from a specific agent using user filtering
export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const userId = searchParams.get('userId');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');

    if (!userId || !dateFrom || !dateTo) {
      return NextResponse.json(
        { error: 'userId, dateFrom, and dateTo are required' },
        { status: 400 }
      );
    }

    console.log(`[Search by Agent] Fetching calls for user_id: ${userId} from ${dateFrom} to ${dateTo}`);

    const allCalls: any[] = [];
    let offset = 0;
    const limit = 10000; // API max
    let hasMore = true;
    let totalFound = 0;
    let pageCount = 0;

    // Fetch ALL pages for this specific agent (no page limit since it's filtered)
    while (hasMore) {
      const params = new URLSearchParams({
        auth_token: CONVOSO_AUTH_TOKEN!,
        start_time: `${dateFrom} 00:00:00`,
        end_time: `${dateTo} 23:59:59`,
        include_recordings: '1',
        limit: String(limit),
        offset: String(offset),
        user_id: userId // Filter by specific user
      });

      const url = `${CONVOSO_API_BASE}/log/retrieve?${params.toString()}`;
      console.log(`[Search by Agent] Fetching page ${pageCount + 1}: offset=${offset}`);

      try {
        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();

        if (data.success === false) {
          // Check if it's because user_id filtering is not supported
          if (data.text && data.text.includes('user_id')) {
            console.warn('[Search by Agent] user_id parameter may not be supported, trying alternative approach');
            break;
          }
          throw new Error(data.text || data.error || 'API returned failure');
        }

        if (data.data && data.data.results) {
          totalFound = data.data.total_found || 0;
          const pageResults = data.data.results;

          console.log(`[Search by Agent] Page ${pageCount + 1}: Found ${pageResults.length} calls`);

          // Transform the calls
          const transformedCalls = pageResults.map((entry: any) => ({
            recording_id: entry.recording?.[0]?.recording_id || entry.id,
            lead_id: entry.lead_id,
            start_time: entry.call_date,
            end_time: entry.call_date,
            duration_seconds: parseInt(entry.call_length) || 0,
            recording_url: entry.recording?.[0]?.public_url || entry.recording?.[0]?.src || '',
            customer_first_name: entry.first_name || '',
            customer_last_name: entry.last_name || '',
            customer_phone: entry.phone_number || '',
            customer_email: '',
            agent_id: entry.user_id || '',
            agent_name: entry.user || '',
            disposition: entry.status_name || entry.status || 'UNKNOWN',
            campaign_name: entry.campaign || 'Unknown Campaign',
            list_name: entry.list_id || 'Unknown List'
          }));

          allCalls.push(...transformedCalls);

          // Check if we need more pages
          if (pageResults.length < limit || offset + limit >= totalFound) {
            hasMore = false;
          } else {
            offset += limit;
            pageCount++;
          }
        } else {
          hasMore = false;
        }
      } catch (error: any) {
        console.error(`[Search by Agent] Error at offset ${offset}:`, error);

        // If user_id filtering failed, fall back to manual filtering
        if (pageCount === 0 && error.message.includes('user_id')) {
          console.log('[Search by Agent] Falling back to manual filtering approach');
          return fetchWithManualFilter(userId, dateFrom, dateTo);
        }

        if (allCalls.length > 0) {
          // Return what we have so far
          break;
        }
        throw error;
      }
    }

    // Sort by date descending
    allCalls.sort((a, b) =>
      new Date(b.start_time).getTime() - new Date(a.start_time).getTime()
    );

    console.log(`[Search by Agent] Completed: Found ${allCalls.length} calls for user ${userId}`);

    return NextResponse.json({
      success: true,
      userId,
      calls: allCalls,
      total: allCalls.length,
      totalAvailable: totalFound,
      dateRange: { from: dateFrom, to: dateTo }
    });

  } catch (error: any) {
    console.error('[Search by Agent] Error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

// Fallback function if user_id parameter is not supported
async function fetchWithManualFilter(userId: string, dateFrom: string, dateTo: string) {
  console.log('[Search by Agent] Using manual filtering for user_id:', userId);

  const allCalls: any[] = [];
  let offset = 0;
  const limit = 10000;
  let hasMore = true;
  let totalScanned = 0;
  const maxPages = 10; // Limit pages when doing manual filtering
  let pageCount = 0;

  while (hasMore && pageCount < maxPages) {
    const params = new URLSearchParams({
      auth_token: CONVOSO_AUTH_TOKEN!,
      start_time: `${dateFrom} 00:00:00`,
      end_time: `${dateTo} 23:59:59`,
      include_recordings: '1',
      limit: String(limit),
      offset: String(offset)
    });

    const url = `${CONVOSO_API_BASE}/log/retrieve?${params.toString()}`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      if (data.success === false) {
        throw new Error(data.text || data.error || 'API returned failure');
      }

      if (data.data && data.data.results) {
        const totalFound = data.data.total_found || 0;

        // Filter for the specific user
        const userCalls = data.data.results.filter((entry: any) =>
          String(entry.user_id) === String(userId)
        );

        totalScanned += data.data.results.length;

        console.log(`[Search by Agent] Page ${pageCount + 1}: Found ${userCalls.length} calls for user out of ${data.data.results.length} scanned`);

        // Transform the filtered calls
        const transformedCalls = userCalls.map((entry: any) => ({
          recording_id: entry.recording?.[0]?.recording_id || entry.id,
          lead_id: entry.lead_id,
          start_time: entry.call_date,
          end_time: entry.call_date,
          duration_seconds: parseInt(entry.call_length) || 0,
          recording_url: entry.recording?.[0]?.public_url || entry.recording?.[0]?.src || '',
          customer_first_name: entry.first_name || '',
          customer_last_name: entry.last_name || '',
          customer_phone: entry.phone_number || '',
          customer_email: '',
          agent_id: entry.user_id || '',
          agent_name: entry.user || '',
          disposition: entry.status_name || entry.status || 'UNKNOWN',
          campaign_name: entry.campaign || 'Unknown Campaign',
          list_name: entry.list_id || 'Unknown List'
        }));

        allCalls.push(...transformedCalls);

        // Check if we need more pages
        if (data.data.results.length < limit || offset + limit >= totalFound) {
          hasMore = false;
        } else {
          offset += limit;
          pageCount++;
        }
      } else {
        hasMore = false;
      }
    } catch (error: any) {
      console.error(`[Search by Agent] Error during manual filtering:`, error);
      break;
    }
  }

  // Sort by date descending
  allCalls.sort((a, b) =>
    new Date(b.start_time).getTime() - new Date(a.start_time).getTime()
  );

  console.log(`[Search by Agent] Manual filter completed: Found ${allCalls.length} calls after scanning ${totalScanned} records`);

  return NextResponse.json({
    success: true,
    userId,
    calls: allCalls,
    total: allCalls.length,
    scannedRecords: totalScanned,
    dateRange: { from: dateFrom, to: dateTo },
    method: 'manual_filter',
    message: pageCount >= maxPages ?
      `Scanned first ${totalScanned} records. Some calls may be missing if agent has calls beyond this range.` :
      `Scanned all ${totalScanned} available records.`
  });
}