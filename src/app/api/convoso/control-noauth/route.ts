import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// TEMPORARY: Control endpoint without auth for testing
export async function GET(req: NextRequest) {
  try {
    console.log('[NOAUTH Control] Getting control settings...');

    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get control settings
    const { data: settings, error } = await supabase
      .from('convoso_control_settings')
      .select('*')
      .single();

    if (error && error.code === 'PGRST116') {
      // No settings exist, create default
      const defaultSettings = {
        id: 1,
        system_enabled: false,
        active_campaigns: [],
        active_lists: [],
        active_dispositions: [],
        active_agents: [],
        updated_at: new Date().toISOString()
      };

      const { error: insertError } = await supabase
        .from('convoso_control_settings')
        .insert(defaultSettings);

      if (insertError) {
        console.error('[NOAUTH Control] Error creating default settings:', insertError);
      }

      return NextResponse.json({
        ...defaultSettings,
        last_sync: null,
        next_sync: null,
        message: 'WARNING: Using noauth endpoint!'
      });
    }

    if (error) {
      console.error('[NOAUTH Control] Error fetching settings:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

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

    console.log('[NOAUTH Control] Settings retrieved successfully');

    return NextResponse.json({
      ...settings,
      last_sync: syncInfo?.updated_at || null,
      next_sync: nextSync,
      message: 'WARNING: Using noauth endpoint!'
    });

  } catch (error: any) {
    console.error('[NOAUTH Control] Error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    console.log('[NOAUTH Control] Updating control settings...');

    const body = await req.json();

    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Update settings
    const { error } = await supabase
      .from('convoso_control_settings')
      .upsert({
        id: 1,
        ...body,
        updated_at: new Date().toISOString()
      });

    if (error) {
      console.error('[NOAUTH Control] Error updating settings:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    console.log('[NOAUTH Control] Settings updated successfully:', body);

    return NextResponse.json({
      success: true,
      message: 'WARNING: Using noauth endpoint!'
    });

  } catch (error: any) {
    console.error('[NOAUTH Control] Error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}