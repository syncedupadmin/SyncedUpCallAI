import { NextRequest, NextResponse } from 'next/server';
import { ConvosoService } from '@/lib/convoso-service';
import { createClient } from '@/lib/supabase/server';

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
    const { calls } = body;

    if (!calls || !Array.isArray(calls)) {
      return NextResponse.json(
        { error: 'calls array is required' },
        { status: 400 }
      );
    }

    console.log(`[Import API] Importing ${calls.length} calls for user ${user.email}`);

    const service = new ConvosoService();

    // Mark calls with import metadata
    const callsWithMetadata = calls.map(call => ({
      ...call,
      source: 'manual' as const,
      imported_by: user.id,
      imported_at: new Date().toISOString()
    }));

    // Save to database
    const savedCount = await service.saveCallsToDatabase(callsWithMetadata, user.id);

    // Queue for transcription if recordings exist
    let queuedCount = 0;
    for (const call of callsWithMetadata) {
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
                imported_by: user.email
              }
            });

          if (!error) {
            queuedCount++;
          }
        }
      }
    }

    console.log(`[Import API] Saved ${savedCount} calls, queued ${queuedCount} for transcription`);

    return NextResponse.json({
      success: true,
      imported: savedCount,
      queued_for_transcription: queuedCount,
      total: calls.length
    });

  } catch (error: any) {
    console.error('[Import API] Error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}