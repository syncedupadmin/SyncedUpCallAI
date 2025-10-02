import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { isAdminAuthenticated } from '@/server/auth/admin';
import { uploadScript, activateScript } from '@/lib/post-close-analysis';

export const dynamic = 'force-dynamic';

// GET all scripts
export async function GET(req: NextRequest) {
  const isAdmin = await isAdminAuthenticated(req);
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const scripts = await db.manyOrNone(`
      SELECT
        id,
        script_name,
        script_version,
        product_type,
        state,
        script_text,
        required_phrases,
        optional_phrases,
        active,
        status,
        min_word_match_percentage,
        created_at,
        updated_at,
        activated_at
      FROM post_close_scripts
      ORDER BY active DESC, created_at DESC
    `);

    return NextResponse.json({
      success: true,
      scripts: scripts || []
    });

  } catch (error: any) {
    console.error('Failed to fetch scripts:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch scripts' },
      { status: 500 }
    );
  }
}

// POST new script or activate existing
export async function POST(req: NextRequest) {
  const isAdmin = await isAdminAuthenticated(req);
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();

    // Check if this is an activation request
    if (body.action === 'activate' && body.script_id) {
      await activateScript(body.script_id);
      return NextResponse.json({
        success: true,
        message: 'Script activated successfully'
      });
    }

    // Otherwise, upload new script
    const result = await uploadScript({
      script_name: body.script_name,
      script_text: body.script_text,
      product_type: body.product_type,
      state: body.state,
      required_phrases: body.required_phrases,
      uploaded_by: body.uploaded_by
    });

    return NextResponse.json({
      success: true,
      script: result
    });

  } catch (error: any) {
    console.error('Script operation failed:', error);
    return NextResponse.json(
      { error: error.message || 'Operation failed' },
      { status: 500 }
    );
  }
}

// DELETE script
export async function DELETE(req: NextRequest) {
  const isAdmin = await isAdminAuthenticated(req);
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const scriptId = searchParams.get('id');

    if (!scriptId) {
      return NextResponse.json({ error: 'Script ID required' }, { status: 400 });
    }

    // Check if script is active
    const script = await db.oneOrNone(`
      SELECT active FROM post_close_scripts WHERE id = $1
    `, [scriptId]);

    if (script?.active) {
      return NextResponse.json(
        { error: 'Cannot delete active script. Deactivate it first.' },
        { status: 400 }
      );
    }

    await db.none(`
      DELETE FROM post_close_scripts WHERE id = $1
    `, [scriptId]);

    return NextResponse.json({
      success: true,
      message: 'Script deleted successfully'
    });

  } catch (error: any) {
    console.error('Script deletion failed:', error);
    return NextResponse.json(
      { error: error.message || 'Deletion failed' },
      { status: 500 }
    );
  }
}
