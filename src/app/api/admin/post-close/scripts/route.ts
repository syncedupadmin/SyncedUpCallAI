import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { withStrictAgencyIsolation } from '@/lib/security/agency-isolation';
import { uploadScript, activateScript } from '@/lib/post-close-analysis';

export const dynamic = 'force-dynamic';

// GET all scripts
export const GET = withStrictAgencyIsolation(async (req, context) => {
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
        strict_mode,
        agency_id,
        created_at,
        updated_at,
        activated_at
      FROM post_close_scripts
      WHERE agency_id = $1
      ORDER BY active DESC, created_at DESC
    `, [context.agencyId]);

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
});

// POST new script or activate existing
export const POST = withStrictAgencyIsolation(async (req, context) => {
  try {
    const body = await req.json();

    // Check if this is an activation request
    if (body.action === 'activate' && body.script_id) {
      // Verify script belongs to user's agency before activating
      const script = await db.oneOrNone(`
        SELECT id FROM post_close_scripts
        WHERE id = $1 AND agency_id = $2
      `, [body.script_id, context.agencyId]);

      if (!script) {
        return NextResponse.json({ error: 'Script not found or access denied' }, { status: 404 });
      }

      await activateScript(body.script_id, context.agencyId);
      return NextResponse.json({
        success: true,
        message: 'Script activated successfully'
      });
    }

    // Check if this is a strict mode toggle request
    if (body.action === 'toggle_strict_mode' && body.script_id) {
      // Verify script belongs to user's agency before toggling
      await db.none(`
        UPDATE post_close_scripts
        SET strict_mode = $1, updated_at = NOW()
        WHERE id = $2 AND agency_id = $3
      `, [body.strict_mode, body.script_id, context.agencyId]);

      return NextResponse.json({
        success: true,
        message: `Strict mode ${body.strict_mode ? 'enabled' : 'disabled'} successfully`
      });
    }

    // Otherwise, upload new script with agency_id
    const result = await uploadScript({
      script_name: body.script_name,
      script_text: body.script_text,
      product_type: body.product_type,
      state: body.state,
      required_phrases: body.required_phrases,
      uploaded_by: context.userId,
      strict_mode: body.strict_mode,
      agency_id: context.agencyId
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
});

// DELETE script
export const DELETE = withStrictAgencyIsolation(async (req, context) => {
  try {
    const { searchParams } = new URL(req.url);
    const scriptId = searchParams.get('id');

    if (!scriptId) {
      return NextResponse.json({ error: 'Script ID required' }, { status: 400 });
    }

    // Check if script belongs to user's agency and if it's active
    const script = await db.oneOrNone(`
      SELECT active FROM post_close_scripts
      WHERE id = $1 AND agency_id = $2
    `, [scriptId, context.agencyId]);

    if (!script) {
      return NextResponse.json({ error: 'Script not found or access denied' }, { status: 404 });
    }

    if (script.active) {
      return NextResponse.json(
        { error: 'Cannot delete active script. Deactivate it first.' },
        { status: 400 }
      );
    }

    await db.none(`
      DELETE FROM post_close_scripts
      WHERE id = $1 AND agency_id = $2
    `, [scriptId, context.agencyId]);

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
});
