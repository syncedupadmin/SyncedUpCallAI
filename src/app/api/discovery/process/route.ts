import { NextRequest, NextResponse } from 'next/server';
import { sbAdmin } from '@/lib/supabase-admin';
import { decryptConvosoCredentials } from '@/lib/crypto';
import { processDiscoveryForAgency, type ConvosoCredentials } from '@/lib/discovery/processor';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes

/**
 * Discovery processor endpoint - processes a single discovery session
 * Called immediately after session creation to process in background
 */
export async function POST(req: NextRequest) {
  console.log(`[Discovery Process] POST request received`);

  try {
    // Verify this is an internal call
    const authHeader = req.headers.get('authorization');
    const internalSecret = process.env.JOBS_SECRET || process.env.CRON_SECRET;

    console.log(`[Discovery Process] Auth header present: ${!!authHeader}`);
    console.log(`[Discovery Process] Internal secret present: ${!!internalSecret}`);

    // Allow calls without auth header for testing, but log it
    if (authHeader && authHeader !== `Bearer ${internalSecret}`) {
      console.warn('[Discovery Process] Invalid authorization header');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    console.log(`[Discovery Process] Request body:`, JSON.stringify(body));

    const { sessionId } = body;

    if (!sessionId) {
      console.error('[Discovery Process] Missing sessionId in request');
      return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
    }

    console.log(`[Discovery Process] Starting processing for session ${sessionId}`);

    // Get session details
    const { data: session, error: sessionError } = await sbAdmin
      .from('discovery_sessions')
      .select('*, agency_id')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      console.error('[Discovery Process] Session not found:', sessionError);
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const agencyId = session.agency_id;

    // Get agency with credentials
    const { data: agency, error: agencyError } = await sbAdmin
      .from('agencies')
      .select('convoso_credentials')
      .eq('id', agencyId)
      .single();

    if (agencyError || !agency || !agency.convoso_credentials) {
      console.error('[Discovery Process] Agency credentials not found');
      return NextResponse.json({ error: 'Agency credentials not found' }, { status: 404 });
    }

    // Decrypt credentials
    const credentials: ConvosoCredentials = decryptConvosoCredentials(agency.convoso_credentials);

    // Get config from session
    const config = session.config || {};

    // Process discovery
    console.log(`[Discovery Process] Calling processDiscoveryForAgency for ${agencyId}`);

    await processDiscoveryForAgency(sessionId, agencyId, credentials, config);

    console.log(`[Discovery Process] Completed successfully for session ${sessionId}`);

    return NextResponse.json({
      success: true,
      message: 'Discovery processing completed',
      sessionId
    });

  } catch (error: any) {
    console.error('[Discovery Process] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Processing failed' },
      { status: 500 }
    );
  }
}
