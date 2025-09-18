import { NextRequest, NextResponse } from 'next/server';
import { ConvosoService } from '@/src/lib/convoso-service';
import { createClient } from '@supabase/supabase-js';

// This runs every 15 minutes via Vercel cron
export async function GET(req: NextRequest) {
  const startTime = Date.now();

  // Allow Vercel cron jobs without authentication
  const isVercelCron = req.headers.get('user-agent')?.includes('vercel-cron');
  const cronSecret = req.headers.get('x-cron-secret');

  if (!isVercelCron && cronSecret !== process.env.CRON_SECRET) {
    console.log('[Convoso Auto] Unauthorized cron attempt');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    const service = new ConvosoService();

    // Check control settings first
    const settings = await service.getControlSettings();

    if (!settings.system_enabled) {
      console.log('[Convoso Auto] System is disabled via control board');
      return NextResponse.json({
        ok: true,
        message: 'System disabled',
        system_enabled: false
      });
    }

    console.log('[Convoso Auto] System enabled, starting sync');

    // Get last sync time
    const { data: syncState } = await supabase
      .from('sync_state')
      .select('value')
      .eq('key', 'last_convoso_check')
      .single();

    const lastSync = syncState?.value
      ? new Date(syncState.value).toISOString().split('T')[0]
      : new Date(Date.now() - 3600000).toISOString().split('T')[0]; // Default: 1 hour ago

    const today = new Date().toISOString().split('T')[0];

    console.log(`[Convoso Auto] Fetching calls from ${lastSync} to ${today}`);

    // Fetch complete call data
    const calls = await service.fetchCompleteCallData(lastSync, today);

    console.log(`[Convoso Auto] Found ${calls.length} calls before filtering`);

    // Apply control board filters
    const filteredCalls = service.applyFilters(calls, settings);

    console.log(`[Convoso Auto] ${filteredCalls.length} calls pass filters`);

    if (filteredCalls.length === 0) {
      // Update sync time even if no calls matched
      await supabase
        .from('sync_state')
        .upsert({
          key: 'last_convoso_check',
          value: new Date().toISOString(),
          office_id: 1,
          updated_at: new Date().toISOString()
        });

      return NextResponse.json({
        ok: true,
        message: 'No calls matched filters',
        calls_found: calls.length,
        calls_filtered: 0,
        filters_applied: {
          campaigns: settings.active_campaigns.length,
          lists: settings.active_lists.length,
          dispositions: settings.active_dispositions.length,
          agents: settings.active_agents.length
        }
      });
    }

    // Mark calls as auto-imported
    const autoImportCalls = filteredCalls.map(call => ({
      ...call,
      source: 'cron' as const,
      imported_by: 'system',
      imported_at: new Date().toISOString()
    }));

    // Save to database
    const savedCount = await service.saveCallsToDatabase(autoImportCalls, 'system');

    // Queue for transcription
    let queuedCount = 0;
    for (const call of autoImportCalls) {
      if (call.recording_url) {
        const { data: savedCall } = await supabase
          .from('calls')
          .select('id')
          .eq('call_id', `convoso_${call.recording_id}`)
          .single();

        if (savedCall) {
          const { error } = await supabase
            .from('transcription_queue')
            .insert({
              call_id: savedCall.id,
              status: 'pending',
              priority: 3, // Lower priority for auto imports
              metadata: {
                auto_import: true,
                imported_at: new Date().toISOString()
              }
            });

          if (!error) {
            queuedCount++;
          }
        }
      }
    }

    // Update sync state
    await supabase
      .from('sync_state')
      .upsert({
        key: 'last_convoso_check',
        value: new Date().toISOString(),
        office_id: 1,
        updated_at: new Date().toISOString()
      });

    const duration = Date.now() - startTime;

    console.log(`[Convoso Auto] Complete: imported ${savedCount} calls, queued ${queuedCount} for transcription in ${duration}ms`);

    return NextResponse.json({
      ok: true,
      calls_found: calls.length,
      calls_filtered: filteredCalls.length,
      calls_imported: savedCount,
      calls_queued: queuedCount,
      duration_ms: duration,
      filters_applied: {
        campaigns: settings.active_campaigns.length,
        lists: settings.active_lists.length,
        dispositions: settings.active_dispositions.length,
        agents: settings.active_agents.length
      }
    });

  } catch (error: any) {
    console.error('[Convoso Auto] Error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}