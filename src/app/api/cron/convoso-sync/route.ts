import { NextRequest, NextResponse } from 'next/server';
import { ConvosoSyncService } from '@/src/lib/convoso-sync';
import { createClient } from '@/src/lib/supabase/server';

// This can be called by cron OR manually
export async function GET(req: NextRequest) {
  // Check if this is a Vercel cron job
  const vercelCron = req.headers.get('x-vercel-cron');
  const userAgent = req.headers.get('user-agent');
  const isVercelCron = vercelCron || userAgent?.includes('vercel-cron');

  // Allow Vercel cron jobs to bypass authentication
  if (isVercelCron) {
    try {
      const syncService = new ConvosoSyncService();
      const officeId = req.nextUrl.searchParams.get('office_id');
      const result = await syncService.syncCalls(
        officeId ? parseInt(officeId) : 1
      );
      return NextResponse.json(result);
    } catch (error: any) {
      console.error('[API] Sync error:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }
  }

  // Optional: Verify cron secret for production
  const cronSecret = req.headers.get('x-cron-secret');
  if (process.env.CRON_SECRET && cronSecret !== process.env.CRON_SECRET) {
    // Allow manual triggers from admin UI
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check if user is super admin using the RPC function
    const { data: isSuperAdmin } = await supabase.rpc('is_super_admin');

    if (!isSuperAdmin) {
      return NextResponse.json(
        { error: 'Super admin access required' },
        { status: 403 }
      );
    }
  }

  try {
    const syncService = new ConvosoSyncService();

    // Get office_id from query params (for manual testing)
    const officeId = req.nextUrl.searchParams.get('office_id');

    const result = await syncService.syncCalls(
      officeId ? parseInt(officeId) : 1
    );

    return NextResponse.json(result);

  } catch (error: any) {
    console.error('[API] Sync error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

// Reset endpoint for testing
export async function POST(req: NextRequest) {
  const supabase = await createClient();

  // Admin only
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: isSuperAdmin } = await supabase.rpc('is_super_admin');

  if (!isSuperAdmin) {
    return NextResponse.json({ error: 'Super admin required' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { office_id = 1, hours_ago = 1 } = body;

    const syncService = new ConvosoSyncService();
    const result = await syncService.resetSyncTime(office_id, hours_ago);

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}