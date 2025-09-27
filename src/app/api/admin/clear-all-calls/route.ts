import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { isSuperAdminAuthenticated, unauthorizedResponse, forbiddenResponse } from '@/server/auth/admin';

export async function DELETE(req: NextRequest) {
  // SECURITY: Super admin only - this is a destructive operation
  const isSuperAdmin = await isSuperAdminAuthenticated(req);

  if (!isSuperAdmin) {
    console.error('[SECURITY] Non-super-admin attempted to delete all calls');
    return forbiddenResponse();
  }

  try {
    console.warn('[ADMIN] Super admin is deleting ALL calls and related data');

    // Delete all related data first (due to foreign key constraints)
    await db.none('DELETE FROM analyses');
    await db.none('DELETE FROM transcripts');
    await db.none('DELETE FROM transcription_queue');
    await db.none('DELETE FROM batch_progress');

    // Finally delete all calls
    const result = await db.result('DELETE FROM calls');

    console.log(`[ADMIN] Successfully deleted ${result.rowCount} calls and all related data`);

    return NextResponse.json({
      ok: true,
      message: `Successfully deleted ${result.rowCount} calls and all related data`
    });

  } catch (error: any) {
    console.error('Error clearing all calls:', error);
    return NextResponse.json({
      ok: false,
      error: error.message
    }, { status: 500 });
  }
}