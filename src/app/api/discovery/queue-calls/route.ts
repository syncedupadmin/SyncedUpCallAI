import { NextRequest, NextResponse } from 'next/server';
import { sbAdmin } from '@/lib/supabase-admin';
import { decryptConvosoCredentials } from '@/lib/crypto';
import {
  fetchCallsInChunks,
  type ConvosoCredentials
} from '@/lib/discovery/processor';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes for fetching 5000 calls

/**
 * Background Job: Fetch Calls from Convoso and Queue for Processing
 * Triggered after discovery session is created
 * Runs independently of user request (can take 2-5 minutes)
 */
export async function POST(req: NextRequest) {
  try {
    // Validate auth
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { sessionId } = await req.json();

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
    }

    console.log(`[Queue Calls] Starting background fetch for session ${sessionId}`);

    // Get session
    const { data: session, error: sessionError } = await sbAdmin
      .from('discovery_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      console.error(`[Queue Calls] Session not found: ${sessionId}`);
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Get agency credentials
    const { data: agency, error: agencyError } = await sbAdmin
      .from('agencies')
      .select('convoso_credentials')
      .eq('id', session.agency_id)
      .single();

    if (agencyError || !agency?.convoso_credentials) {
      console.error(`[Queue Calls] No credentials for session ${sessionId}`);
      await sbAdmin
        .from('discovery_sessions')
        .update({
          status: 'error',
          error_message: 'Agency credentials not found'
        })
        .eq('id', sessionId);
      return NextResponse.json({ error: 'Credentials not found' }, { status: 400 });
    }

    const credentials: ConvosoCredentials = decryptConvosoCredentials(
      agency.convoso_credentials
    );

    const targetCallCount = session.config?.callCount || 5000;
    const selectedAgentIds = session.config?.selectedAgents || [];

    console.log(`[Queue Calls] Fetching ${targetCallCount} calls from Convoso...`);

    // Fetch calls (this can take 2-5 minutes)
    const calls = await fetchCallsInChunks(
      credentials,
      sessionId,
      targetCallCount,
      selectedAgentIds
    );

    if (!calls || calls.length === 0) {
      console.error(`[Queue Calls] No calls found for session ${sessionId}`);
      await sbAdmin.from('discovery_sessions').update({
        status: 'error',
        error_message: 'No calls found from Convoso'
      }).eq('id', sessionId);

      return NextResponse.json({ error: 'No calls found' }, { status: 400 });
    }

    console.log(`[Queue Calls] Fetched ${calls.length} calls, inserting into queue...`);

    // Deduplicate calls before inserting
    const seenCallIds = new Set();
    const callRecords = calls
      .filter(call => {
        if (seenCallIds.has(call.id)) {
          console.warn(`[Queue Calls] Skipping duplicate call_id: ${call.id}`);
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
        recording_url: call.recording_url || null,
        processing_status: 'pending'
      }));

    console.log(`[Queue Calls] Deduplicated to ${callRecords.length} unique calls`);

    // Batch insert (1000 per batch)
    const totalBatches = Math.ceil(callRecords.length / 1000);
    for (let i = 0; i < callRecords.length; i += 1000) {
      const batch = callRecords.slice(i, Math.min(i + 1000, callRecords.length));
      const batchNum = Math.floor(i / 1000) + 1;

      console.log(`[Queue Calls] Inserting batch ${batchNum}/${totalBatches} (${batch.length} calls)...`);

      const { error: insertError } = await sbAdmin
        .from('discovery_calls')
        .upsert(batch, {
          onConflict: 'session_id,call_id',
          ignoreDuplicates: true
        });

      if (insertError) {
        console.error(`[Queue Calls] Failed to insert batch ${batchNum}:`, insertError);
        // Continue with next batch
        continue;
      }

      console.log(`[Queue Calls] Batch ${batchNum}/${totalBatches} inserted successfully`);
    }

    // Count calls with recordings
    const { count: withRecordings } = await sbAdmin
      .from('discovery_calls')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', sessionId)
      .not('recording_url', 'is', null);

    console.log(`[Queue Calls] Recording availability: ${withRecordings}/${callRecords.length} (${Math.round((withRecordings || 0)/callRecords.length*100)}%)`);

    // Update session to queued (ready for processing)
    await sbAdmin.from('discovery_sessions').update({
      status: 'queued',
      total_calls: callRecords.length,
      progress: 5  // Metadata fetched
    }).eq('id', sessionId);

    console.log(`[Queue Calls] Successfully queued ${callRecords.length} calls (${withRecordings} with recordings)`);

    return NextResponse.json({
      success: true,
      sessionId,
      callCount: callRecords.length,
      callsWithRecordings: withRecordings || 0
    });

  } catch (error: any) {
    console.error('[Queue Calls] Fatal error:', error);
    return NextResponse.json({
      error: error.message || 'Failed to queue calls'
    }, { status: 500 });
  }
}
