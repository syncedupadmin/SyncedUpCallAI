import { NextRequest, NextResponse } from 'next/server';
import { ConvosoSyncService } from '@/src/lib/convoso-sync';
import { createClient } from '@/src/lib/supabase/server';

export async function GET(req: NextRequest) {
  const supabase = await createClient();

  // Check authentication
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check if user is admin
  const { data: isAdmin } = await supabase
    .from('admin_users')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!isAdmin) {
    return NextResponse.json({ error: 'Admin required' }, { status: 403 });
  }

  try {
    // Get office_id from query params (default to 1)
    const officeId = req.nextUrl.searchParams.get('office_id');

    const syncService = new ConvosoSyncService();
    const status = await syncService.getSyncStatus(
      officeId ? parseInt(officeId) : 1
    );

    return NextResponse.json(status);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}