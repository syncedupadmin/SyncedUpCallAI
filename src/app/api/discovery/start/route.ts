import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sbAdmin } from '@/lib/supabase-admin';
import { v4 as uuidv4 } from 'uuid';
import { encryptConvosoCredentials, decryptConvosoCredentials } from '@/lib/crypto';
import {
  fetchCallsInChunks,
  checkConvosoDataAvailability,
  type ConvosoCredentials
} from '@/lib/discovery/processor';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Only needs 60s for metadata queueing

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
      console.log(`[Discovery] Selected agent IDs:`, selected_agent_ids);
      console.log(`[Discovery] First agent ID type:`, typeof selected_agent_ids[0], selected_agent_ids[0]);

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
      const targetCallCount = 10000; // Fetch more calls to account for low recording availability (~6%)

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

      console.log(`[Discovery] Queueing calls for session ${sessionId}`);

      // Decrypt credentials
      const credentials: ConvosoCredentials = decryptConvosoCredentials(
        agency.convoso_credentials
      );

      // Fetch metadata only (30-40s)
      const calls = await fetchCallsInChunks(
        credentials,
        sessionId,
        targetCallCount,
        selected_agent_ids
      );

      if (!calls || calls.length === 0) {
        await sbAdmin.from('discovery_sessions').update({
          status: 'error',
          error_message: 'No calls found from Convoso'
        }).eq('id', sessionId);

        return NextResponse.json(
          { error: 'No calls found from Convoso API' },
          { status: 400 }
        );
      }

      console.log(`[Discovery] Fetched ${calls.length} calls, inserting into queue...`);

      // Check if discovery_calls table exists
      console.log(`[Discovery] Verifying discovery_calls table exists...`);
      const { error: tableCheck } = await sbAdmin
        .from('discovery_calls')
        .select('id')
        .limit(1);

      if (tableCheck) {
        console.error('[Discovery] Table check error:', tableCheck);
        if (tableCheck.code === '42P01' || tableCheck.message?.includes('does not exist')) {
          await sbAdmin.from('discovery_sessions').update({
            status: 'error',
            error_message: 'Database not configured - discovery_calls table missing. Contact support.'
          }).eq('id', sessionId);

          return NextResponse.json({
            error: 'System not configured for queue-based discovery. The discovery_calls table does not exist. Please run the database migrations.',
            hint: 'Admin: Run supabase/migrations/add-discovery-queue-system-safe.sql'
          }, { status: 500 });
        }
      }

      console.log(`[Discovery] Table verified, preparing ${calls.length} call records...`);

      // Deduplicate calls before inserting (safety check)
      const seenCallIds = new Set();
      const callRecords = calls
        .filter(call => {
          if (seenCallIds.has(call.id)) {
            console.warn(`[Discovery] Skipping duplicate call_id in batch: ${call.id}`);
            return false;
          }
          seenCallIds.add(call.id);
          return true;
        })
        .map(call => ({
          session_id: sessionId,
          call_id: call.id,
          lead_id: call.lead_id,
          user_id: call.user_id,
          user_name: call.user,
          campaign: call.campaign,
          status: call.status,
          call_length: parseInt(call.call_length) || 0,
          call_type: call.call_type || 'outbound',
          started_at: call.started_at,
          recording_url: call.recording_url || null,  // Store recording URL from API
          processing_status: 'pending'
        }));

      console.log(`[Discovery] Deduplicated to ${callRecords.length} unique calls for insert`);

      // Batch insert (Supabase handles up to 1000 rows per insert)
      const totalBatches = Math.ceil(callRecords.length / 1000);
      for (let i = 0; i < callRecords.length; i += 1000) {
        const batch = callRecords.slice(i, Math.min(i + 1000, callRecords.length));
        const batchNum = Math.floor(i / 1000) + 1;

        console.log(`[Discovery] Upserting batch ${batchNum}/${totalBatches} (${batch.length} calls)...`);

        const { error: insertError } = await sbAdmin
          .from('discovery_calls')
          .upsert(batch, {
            onConflict: 'session_id,call_id',
            ignoreDuplicates: true
          });

        if (insertError) {
          console.error(`[Discovery] Failed to upsert batch ${batchNum}:`, insertError);
          console.error(`[Discovery] Error details:`, {
            code: insertError.code,
            message: insertError.message,
            details: insertError.details,
            hint: insertError.hint
          });

          // Continue with next batch instead of throwing
          console.warn(`[Discovery] Continuing with remaining batches despite error in batch ${batchNum}`);
          continue;
        }

        console.log(`[Discovery] Batch ${batchNum}/${totalBatches} upserted successfully`);
      }

      // Update session to queued
      await sbAdmin.from('discovery_sessions').update({
        status: 'queued',
        total_calls: calls.length,
        progress: 5  // Metadata pulled
      }).eq('id', sessionId);

      console.log(`[Discovery] Successfully queued ${calls.length} calls for background processing`);

      // Count calls with recordings
      const { count: withRecordings } = await sbAdmin
        .from('discovery_calls')
        .select('*', { count: 'exact', head: true })
        .eq('session_id', sessionId)
        .not('recording_url', 'is', null);

      console.log(`[Discovery] Recording availability: ${withRecordings}/${calls.length} (${Math.round((withRecordings || 0)/calls.length*100)}%)`);

      return NextResponse.json({
        success: true,
        sessionId,
        callCount: calls.length,
        callsWithRecordings: withRecordings || 0,
        message: `Discovery queued - processing ${withRecordings || 0} calls with recordings (${calls.length} total fetched)`
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
