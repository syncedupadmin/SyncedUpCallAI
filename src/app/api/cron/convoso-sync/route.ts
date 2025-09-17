import { NextRequest, NextResponse } from 'next/server';
import { ConvosoSyncService } from '@/src/lib/convoso-sync';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

// This can be called by cron OR manually
export async function GET(req: NextRequest) {
  // Optional: Verify cron secret for production
  const cronSecret = req.headers.get('x-cron-secret');
  if (process.env.CRON_SECRET && cronSecret !== process.env.CRON_SECRET) {
    // Allow manual triggers from admin UI
    const cookieStore = await cookies();
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check if user is admin
    const { data: isAdmin } = await supabase
      .from('admin_users')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Admin access required' },
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
  const cookieStore = await cookies();
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );

  // Admin only
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: isAdmin } = await supabase
    .from('admin_users')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!isAdmin) {
    return NextResponse.json({ error: 'Admin required' }, { status: 403 });
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