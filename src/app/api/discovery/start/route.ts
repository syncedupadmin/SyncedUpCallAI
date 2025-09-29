import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sbAdmin } from '@/lib/supabase-admin';
import { v4 as uuidv4 } from 'uuid';
import { encryptConvosoCredentials } from '@/lib/crypto';
import {
  processDiscoveryForAgency,
  checkConvosoDataAvailability,
  type ConvosoCredentials
} from '@/lib/discovery/processor';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes for discovery processing

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { convoso_api_key, convoso_auth_token, convoso_api_base } = await req.json();

    if (!convoso_api_key || !convoso_auth_token) {
      return NextResponse.json(
        { error: 'Missing Convoso credentials' },
        { status: 400 }
      );
    }

    // Get user's agency
    const { data: membership, error: membershipError } = await supabase
      .from('user_agencies')
      .select(`
        agency_id,
        agencies (
          id,
          name,
          discovery_status
        )
      `)
      .eq('user_id', user.id)
      .single();

    if (membershipError || !membership || !membership.agency_id) {
      console.error('Membership query error:', membershipError);
      return NextResponse.json({ error: 'No agency found' }, { status: 404 });
    }

    const agencyId = membership.agency_id;
    const agency = (membership as any).agencies;

    // Check if discovery already completed
    if (agency.discovery_status === 'completed') {
      return NextResponse.json(
        { error: 'Discovery already completed' },
        { status: 400 }
      );
    }

    const apiBase = convoso_api_base || 'https://api.convoso.com/v1';

    // Validate Convoso credentials and check data availability
    const credentials: ConvosoCredentials = {
      api_key: convoso_api_key,
      auth_token: convoso_auth_token,
      api_base: apiBase
    };

    console.log(`[Discovery] Validating credentials for agency ${agencyId}`);

    const availability = await checkConvosoDataAvailability(credentials);

    if (!availability.available) {
      // Not enough data - skip discovery
      await sbAdmin.from('agencies').update({
        discovery_status: 'skipped',
        discovery_skip_reason: availability.error || 'insufficient_data'
      }).eq('id', agencyId);

      return NextResponse.json({
        skipped: true,
        reason: availability.error ||
          `Only ${availability.callCount} calls found. Need at least 100 for meaningful discovery.`,
        callCount: availability.callCount,
        redirectTo: '/dashboard'
      }, { status: 200 });
    }

    console.log(`[Discovery] Found ${availability.callCount} calls available`);

    // Create discovery session
    const sessionId = uuidv4();
    const targetCallCount = Math.min(2500, availability.callCount);

    await sbAdmin.from('discovery_sessions').insert({
      id: sessionId,
      agency_id: agencyId,
      status: 'initializing',
      total_calls: targetCallCount,
      progress: 0,
      processed: 0,
      config: {
        callCount: targetCallCount,
        agentSelection: 'all',
        includeShortCalls: true,
        detectLying: true,
        analyzeOpenings: true,
        trackRebuttals: true
      }
    });

    // Encrypt and store credentials
    const encryptedCredentials = encryptConvosoCredentials(
      convoso_api_key,
      convoso_auth_token,
      apiBase
    );

    await sbAdmin.from('agencies').update({
      discovery_status: 'in_progress',
      discovery_session_id: sessionId,
      convoso_credentials: encryptedCredentials
    }).eq('id', agencyId);

    console.log(`[Discovery] Starting background processing for session ${sessionId}`);

    // Start background processing (don't await)
    processDiscoveryForAgency(sessionId, agencyId, credentials, {
      callCount: targetCallCount,
      agentSelection: 'all',
      includeShortCalls: true,
      detectLying: true,
      analyzeOpenings: true,
      trackRebuttals: true
    }).catch(error => {
      console.error(`[Discovery] Background processing error:`, error);
    });

    return NextResponse.json({
      success: true,
      sessionId,
      callCount: targetCallCount,
      message: `Discovery started - analyzing ${targetCallCount} calls from Convoso`
    });

  } catch (error: any) {
    console.error('[Discovery] Start endpoint error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to start discovery' },
      { status: 500 }
    );
  }
}