import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// TEMPORARY: Import endpoint without auth for testing
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { calls } = body;

    if (!calls || !Array.isArray(calls)) {
      return NextResponse.json(
        { error: 'calls array is required' },
        { status: 400 }
      );
    }

    console.log(`[NOAUTH Import] Importing ${calls.length} calls`);

    // Create service client with proper permissions
    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Use a default user ID for noauth imports
    const defaultUserId = 'manual-import';

    let savedCount = 0;

    // Save calls directly to database
    for (const call of calls) {
      const callData = {
        call_id: `convoso_${call.recording_id}`,
        convoso_lead_id: call.lead_id,
        lead_id: call.lead_id,
        agent_name: call.agent_name,
        agent_email: null,
        disposition: call.disposition,
        duration_sec: call.duration_seconds,
        phone_number: call.customer_phone,
        recording_url: call.recording_url,
        campaign: call.campaign_name,
        started_at: call.start_time,
        ended_at: call.end_time,
        office_id: 1,
        source: 'manual',
        metadata: {
          customer_name: `${call.customer_first_name} ${call.customer_last_name}`.trim(),
          customer_email: call.customer_email,
          list_name: call.list_name,
          imported_by: defaultUserId,
          imported_at: new Date().toISOString()
        }
      };

      const { error } = await supabase
        .from('calls')
        .upsert(callData, {
          onConflict: 'call_id',
          ignoreDuplicates: false
        });

      if (!error) {
        savedCount++;
        console.log(`[NOAUTH Import] Successfully saved call ${call.recording_id}`);
      } else {
        console.error(`[NOAUTH Import] Error saving call ${call.recording_id}:`, JSON.stringify(error, null, 2));
      }
    }

    // Queue for transcription if recordings exist
    let queuedCount = 0;
    for (const call of calls) {
      if (call.recording_url) {
        // Get the saved call from database to get its ID
        const { data: savedCall } = await supabase
          .from('calls')
          .select('id')
          .eq('call_id', `convoso_${call.recording_id}`)
          .single();

        if (savedCall) {
          // Queue for transcription
          const { error } = await supabase
            .from('transcription_queue')
            .insert({
              call_id: savedCall.id,
              status: 'pending',
              priority: 2, // Normal priority for manual imports
              metadata: {
                manual_import: true,
                imported_by: 'noauth-import'
              }
            });

          if (!error) {
            queuedCount++;
          } else {
            console.log(`[NOAUTH Import] Error queuing transcription:`, error);
          }
        }
      }
    }

    console.log(`[NOAUTH Import] Saved ${savedCount} calls, queued ${queuedCount} for transcription`);

    return NextResponse.json({
      success: true,
      imported: savedCount,
      queued_for_transcription: queuedCount,
      total: calls.length,
      message: 'WARNING: Using noauth import endpoint'
    });

  } catch (error: any) {
    console.error('[NOAUTH Import] Error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}