import { NextRequest, NextResponse } from 'next/server';
import { sbAdmin } from '@/lib/supabase-admin';
import { createClient } from '@/lib/supabase/server';
import { decryptConvosoCredentials } from '@/lib/crypto';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    // Verify super admin access
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const adminEmail = process.env.ADMIN_EMAIL;
    if (user.email !== adminEmail) {
      return NextResponse.json({ error: 'Unauthorized - not super admin' }, { status: 401 });
    }

    // Get latest discovery session to find agency
    const { data: sessions } = await sbAdmin
      .from('discovery_sessions')
      .select('agency_id')
      .order('started_at', { ascending: false })
      .limit(1);

    if (!sessions || sessions.length === 0) {
      return NextResponse.json({ error: 'No discovery sessions found' }, { status: 404 });
    }

    const agencyId = sessions[0].agency_id;

    // Get agency credentials
    const { data: agency } = await sbAdmin
      .from('agencies')
      .select('convoso_credentials')
      .eq('id', agencyId)
      .single();

    if (!agency?.convoso_credentials) {
      return NextResponse.json({ error: 'No credentials found' }, { status: 404 });
    }

    const credentials = decryptConvosoCredentials(agency.convoso_credentials);

    // Fetch sample calls
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    const params = new URLSearchParams({
      auth_token: credentials.auth_token,
      start: startDate.toISOString().split('T')[0],
      end: endDate.toISOString().split('T')[0],
      limit: '10',
      offset: '0',
      include_recordings: '1'
    });

    const response = await fetch(
      `${credentials.api_base}/log/retrieve?${params.toString()}`,
      { headers: { 'Accept': 'application/json' } }
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: `Convoso API error: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    const calls = data.data?.results || [];

    // Analyze recording field structure
    const analysis = calls.map((call: any) => ({
      call_id: call.id,
      call_length: call.call_length,
      has_recording_field: !!call.recording,
      recording_type: typeof call.recording,
      recording_is_array: Array.isArray(call.recording),
      recording_length: Array.isArray(call.recording) ? call.recording.length : null,
      recording_keys: call.recording && typeof call.recording === 'object'
        ? Object.keys(call.recording)
        : null,
      first_recording: call.recording?.[0] ? {
        keys: Object.keys(call.recording[0]),
        has_public_url: !!call.recording[0].public_url,
        has_src: !!call.recording[0].src,
        sample_url: call.recording[0].public_url || call.recording[0].src || null
      } : null,
      // Show all top-level keys that might contain recording info
      top_level_keys: Object.keys(call).filter(k =>
        k.toLowerCase().includes('record') ||
        k.toLowerCase().includes('audio') ||
        k.toLowerCase().includes('url')
      )
    }));

    return NextResponse.json({
      total_calls: calls.length,
      calls_with_recording_field: analysis.filter((a: any) => a.has_recording_field).length,
      sample_analysis: analysis,
      raw_first_call: calls[0] // Include full first call for inspection
    });

  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch Convoso sample' },
      { status: 500 }
    );
  }
}
