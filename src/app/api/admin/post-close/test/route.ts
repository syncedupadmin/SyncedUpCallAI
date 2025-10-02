import { NextRequest, NextResponse } from 'next/server';
import { isAdminAuthenticated } from '@/server/auth/admin';
import { analyzeCompliance, getActiveScript } from '@/lib/post-close-analysis';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const isAdmin = await isAdminAuthenticated(req);
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { transcript, script_id } = body;

    if (!transcript) {
      return NextResponse.json({ error: 'Transcript required' }, { status: 400 });
    }

    // Get script (use provided ID or active script)
    let scriptToUse = script_id;
    if (!scriptToUse) {
      const activeScript = await getActiveScript();
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
}
