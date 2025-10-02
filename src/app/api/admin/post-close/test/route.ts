import { NextRequest, NextResponse } from 'next/server';
import { withStrictAgencyIsolation } from '@/lib/security/agency-isolation';
import { analyzeCompliance, getActiveScript } from '@/lib/post-close-analysis';
import { db } from '@/server/db';

export const dynamic = 'force-dynamic';

export const POST = withStrictAgencyIsolation(async (req, context) => {
  try {
    const body = await req.json();
    const { transcript, script_id } = body;

    if (!transcript) {
      return NextResponse.json({ error: 'Transcript required' }, { status: 400 });
    }

    // Get script (use provided ID or active script for this agency)
    let scriptToUse = script_id;
    if (scriptToUse) {
      // Verify script belongs to user's agency
      const script = await db.oneOrNone(`
        SELECT id FROM post_close_scripts WHERE id = $1 AND agency_id = $2
      `, [scriptToUse, context.agencyId]);

      if (!script) {
        return NextResponse.json(
          { error: 'Script not found or access denied' },
          { status: 404 }
        );
      }
    } else {
      // Get active script for this agency
      const activeScript = await getActiveScript(undefined, undefined, context.agencyId);
      if (!activeScript) {
        return NextResponse.json(
          { error: 'No active script found. Please upload and activate a script first.' },
          { status: 400 }
        );
      }
      scriptToUse = activeScript.id;
    }

    // Analyze compliance
    const result = await analyzeCompliance(transcript, scriptToUse);

    return NextResponse.json({
      success: true,
      ...result
    });

  } catch (error: any) {
    console.error('Test analysis failed:', error);
    return NextResponse.json(
      { error: error.message || 'Test failed' },
      { status: 500 }
    );
  }
});
