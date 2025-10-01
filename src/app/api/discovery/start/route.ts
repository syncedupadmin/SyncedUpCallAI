import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sbAdmin } from '@/lib/supabase-admin';
import { v4 as uuidv4 } from 'uuid';
import { encryptConvosoCredentials, decryptConvosoCredentials } from '@/lib/crypto';
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

    const body = await req.json();
    const { convoso_auth_token, validate_only, selected_agent_ids } = body;

    // Get user's agency
    const { data: membership, error: membershipError } = await supabase
      .from('user_agencies')
      .select(`
        agency_id,
        agencies (
          id,
          name,
          discovery_status,
          convoso_credentials
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
    const apiBase = 'https://api.convoso.com/v1';

    // MODE 1: Validate credentials and store them
    if (validate_only && convoso_auth_token) {
      console.log(`[Discovery] Validating auth token for agency ${agencyId}`);

      // Validate with test request using log/retrieve
      try {
        const testResponse = await fetch(
          `${apiBase}/log/retrieve?auth_token=${convoso_auth_token}&limit=1`,
          { headers: { 'Accept': 'application/json' } }
        );

        if (!testResponse.ok) {
          const errorText = await testResponse.text();
          console.error('[Discovery] Convoso validation failed:', errorText);
          return NextResponse.json(
            { error: 'Invalid Convoso auth token. Please check your token and try again.' },
            { status: 401 }
          );
        }
      } catch (error: any) {
        console.error('[Discovery] Convoso connection error:', error);
        return NextResponse.json(
          { error: 'Failed to connect to Convoso. Please try again.' },
          { status: 500 }
        );
      }

      // Check data availability (10+ second calls only)
      const credentials: ConvosoCredentials = {
        api_key: '', // Not used anymore
        auth_token: convoso_auth_token,
        api_base: apiBase
      };

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
            `Only ${availability.callCount} calls (10+ sec) found. Need at least 100 for meaningful discovery.`,
          callCount: availability.callCount,
          redirectTo: '/dashboard'
        }, { status: 200 });
      }

      console.log(`[Discovery] Found ${availability.callCount} calls (10+ sec) available`);

      // Encrypt and store credentials
      const encryptedCredentials = encryptConvosoCredentials(
        '', // API key not used
        convoso_auth_token,
        apiBase
      );

      await sbAdmin.from('agencies').update({
        convoso_credentials: encryptedCredentials
      }).eq('id', agencyId);

      return NextResponse.json({
        success: true,
        validated: true,
        callCount: availability.callCount
      });
    }

    // MODE 2: Start discovery with selected agents
    if (selected_agent_ids && Array.isArray(selected_agent_ids)) {
      console.log(`[Discovery] Starting discovery for agency ${agencyId} with ${selected_agent_ids.length} agents`);

      // Check if discovery already completed
      if (agency.discovery_status === 'completed') {
        return NextResponse.json(
          { error: 'Discovery already completed' },
          { status: 400 }
        );
      }

      // Must have credentials stored from validate step
      if (!agency.convoso_credentials) {
        return NextResponse.json(
          { error: 'Convoso credentials not found. Please go back and re-enter your auth token.' },
          { status: 400 }
        );
      }

      // Create discovery session
      const sessionId = uuidv4();
      const targetCallCount = 2500; // Will be distributed across selected agents

      await sbAdmin.from('discovery_sessions').insert({
        id: sessionId,
        agency_id: agencyId,
        status: 'initializing',
        total_calls: targetCallCount,
        progress: 0,
        processed: 0,
        config: {
          callCount: targetCallCount,
          selectedAgents: selected_agent_ids,
          agentSelection: 'custom',
          includeShortCalls: false, // CRITICAL: Only 10+ second calls
          detectLying: true,
          analyzeOpenings: true,
          trackRebuttals: true
        }
      });

      await sbAdmin.from('agencies').update({
        discovery_status: 'in_progress',
        discovery_session_id: sessionId
      }).eq('id', agencyId);

      console.log(`[Discovery] Triggering processor endpoint for session ${sessionId}`);

      // Trigger the processor endpoint to handle the actual discovery
      // This endpoint has proper timeout handling and can run for up to 5 minutes
      const processorUrl = `${process.env.APP_URL || 'https://aicall.syncedupsolutions.com'}/api/discovery/process`;
      const secret = process.env.JOBS_SECRET || process.env.CRON_SECRET;

      console.log(`[Discovery] Processor URL: ${processorUrl}`);
      console.log(`[Discovery] Has secret: ${!!secret}`);

      // Fire and forget - don't await
      fetch(processorUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${secret}`
        },
        body: JSON.stringify({ sessionId })
      })
        .then(res => {
          console.log(`[Discovery] Processor triggered - status: ${res.status}`);
          return res.text();
        })
        .then(text => {
          console.log(`[Discovery] Processor response: ${text}`);
        })
        .catch(error => {
          console.error(`[Discovery] Failed to trigger processor:`, error);
        });

      return NextResponse.json({
        success: true,
        sessionId,
        callCount: targetCallCount,
        message: `Discovery started - analyzing calls from ${selected_agent_ids.length} agents`
      });
    }

    // Invalid request
    return NextResponse.json(
      { error: 'Invalid request. Provide either convoso_auth_token with validate_only or selected_agent_ids.' },
      { status: 400 }
    );

  } catch (error: any) {
    console.error('[Discovery] Start endpoint error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to start discovery' },
      { status: 500 }
    );
  }
}
