import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';

export async function DELETE(req: NextRequest) {
  try {
    // Delete all related data first (due to foreign key constraints)
    await db.none('DELETE FROM analyses');
    await db.none('DELETE FROM transcripts');
    await db.none('DELETE FROM transcription_queue');
    await db.none('DELETE FROM batch_progress');

    // Finally delete all calls
    const result = await db.result('DELETE FROM calls');

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