import { NextRequest, NextResponse } from 'next/server';
import { ConvosoService } from '@/lib/convoso-service';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
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

    const service = new ConvosoService();
    const settings = await service.getControlSettings();

    // Get last sync info
    const { data: syncInfo } = await supabase
      .from('sync_state')
      .select('value, updated_at')
      .eq('key', 'last_convoso_check')
      .single();

    // Calculate next sync time (every 15 minutes)
    let nextSync = null;
    if (syncInfo?.updated_at) {
      const lastSync = new Date(syncInfo.updated_at);
      nextSync = new Date(lastSync.getTime() + 15 * 60 * 1000);
    }

    return NextResponse.json({
      ...settings,
      last_sync: syncInfo?.updated_at || null,
      next_sync: nextSync
    });

  } catch (error: any) {
    console.error('[Control API] Error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

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
    const service = new ConvosoService();

    // Update settings
    const success = await service.updateControlSettings(body);

    if (!success) {
      return NextResponse.json(
        { error: 'Failed to update settings' },
        { status: 500 }
      );
    }

    // Log the change
    console.log('[Control API] Settings updated by', user.email, ':', body);

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('[Control API] Error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}