import { NextRequest, NextResponse } from 'next/server';
import { ConvosoService } from '@/src/lib/convoso-service';
import { createClient } from '@/src/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    // Check authentication
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check super admin
    const { data: isSuperAdmin } = await supabase.rpc('is_super_admin');
    if (!isSuperAdmin) {
      return NextResponse.json({ error: 'Super admin required' }, { status: 403 });
    }

    const body = await req.json();
    const { dateFrom, dateTo, timeFrom, timeTo } = body;

    if (!dateFrom || !dateTo) {
      return NextResponse.json(
        { error: 'dateFrom and dateTo are required' },
        { status: 400 }
      );
    }

    // Format dates with time if provided
    let startDate = dateFrom;
    let endDate = dateTo;

    if (timeFrom) {
      startDate = `${dateFrom} ${timeFrom}:00`;
    }
    if (timeTo) {
      endDate = `${dateTo} ${timeTo}:59`;
    }

    console.log(`[Search API] Searching from ${startDate} to ${endDate}`);

    const service = new ConvosoService();

    // Fetch complete call data (recordings + lead info)
    const calls = await service.fetchCompleteCallData(dateFrom, dateTo);

    // Get filter options from the results
    const filterOptions = service.getFilterOptions(calls);

    // Sort by start_time descending by default
    calls.sort((a, b) =>
      new Date(b.start_time).getTime() - new Date(a.start_time).getTime()
    );

    console.log(`[Search API] Found ${calls.length} calls`);

    return NextResponse.json({
      success: true,
      calls,
      filterOptions,
      total: calls.length,
      dateRange: {
        from: startDate,
        to: endDate
      }
    });

  } catch (error: any) {
    console.error('[Search API] Error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}