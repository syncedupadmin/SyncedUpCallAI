import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logError } from '@/lib/log';

// Default settings
const DEFAULT_SETTINGS = {
  strict_mode_threshold: 98,
  fuzzy_mode_threshold: 80,
  auto_analyze_new_calls: true,
  email_notifications: false,
  notification_email: ''
};

export async function GET() {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's agency
    const { data: membership, error: memberError } = await supabase
      .from('user_agencies')
      .select('agency_id')
      .eq('user_id', user.id)
      .single();

    if (memberError || !membership) {
      return NextResponse.json({ error: 'No agency found' }, { status: 404 });
    }

    // Get agency settings
    const { data: agency, error: agencyError } = await supabase
      .from('agencies')
      .select('compliance_settings')
      .eq('id', membership.agency_id)
      .single();

    if (agencyError) {
      logError('Failed to get agency settings', agencyError, {
        agency_id: membership.agency_id,
        user_id: user.id
      });
      return NextResponse.json({ error: 'Failed to get settings' }, { status: 500 });
    }

    // Return settings or defaults
    const settings = agency?.compliance_settings || DEFAULT_SETTINGS;

    return NextResponse.json({ settings });

  } catch (error: any) {
    logError('Failed to get compliance settings', error, {
      error_message: error.message
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const body = await req.json();

    // Validate settings
    const settings = {
      strict_mode_threshold: Math.min(100, Math.max(90, body.strict_mode_threshold || 98)),
      fuzzy_mode_threshold: Math.min(95, Math.max(50, body.fuzzy_mode_threshold || 80)),
      auto_analyze_new_calls: body.auto_analyze_new_calls !== false,
      email_notifications: body.email_notifications === true,
      notification_email: body.notification_email || ''
    };

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's agency and check permissions
    const { data: membership, error: memberError } = await supabase
      .from('user_agencies')
      .select('agency_id, role')
      .eq('user_id', user.id)
      .single();

    if (memberError || !membership) {
      return NextResponse.json({ error: 'No agency found' }, { status: 404 });
    }

    // Only admin and super admin can update settings
    if (!['admin', 'super_admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    // Update agency settings
    const { error: updateError } = await supabase
      .from('agencies')
      .update({
        compliance_settings: settings,
        updated_at: new Date().toISOString()
      })
      .eq('id', membership.agency_id);

    if (updateError) {
      logError('Failed to update settings', updateError, {
        agency_id: membership.agency_id,
        user_id: user.id
      });
      return NextResponse.json(
        { error: 'Failed to save settings' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, settings });

  } catch (error: any) {
    logError('Failed to save compliance settings', error, {
      error_message: error.message
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}