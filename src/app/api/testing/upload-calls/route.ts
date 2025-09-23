import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { isAdminAuthenticated } from '@/server/auth/admin';
import { writeFile } from 'fs/promises';
import path from 'path';
import { createReadStream } from 'fs';
import unzipper from 'unzipper';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// POST /api/testing/upload-calls - Upload MP3s or ZIP for testing
export async function POST(req: NextRequest) {
  // Check admin authentication
  const isAdmin = await isAdminAuthenticated(req);
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const suiteId = formData.get('suite_id') as string || '876b6b65-ddaa-42fe-aecd-80457cb66035';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    console.log(`[Upload] Received file: ${file.name}, size: ${file.size} bytes`);

    const imported = [];
    const failed = [];

    // Handle single MP3
    if (file.name.toLowerCase().endsWith('.mp3')) {
      try {
        // Upload to Supabase storage or save locally
        const fileName = `test-call-${Date.now()}-${file.name}`;
        const publicUrl = `/uploads/${fileName}`; // You'd implement actual file storage

        // Create test case
        const testCase = await db.one(`
          INSERT INTO ai_test_cases (
            suite_id,
            name,
            audio_url,
            audio_duration_sec,
            test_category,
            metadata,
            difficulty_level,
            source
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING id
        `, [
          suiteId,
          file.name.replace('.mp3', ''),
          publicUrl,
          30, // Default duration, you could calculate actual
          'phone_quality',
          JSON.stringify({
            original_filename: file.name,
            uploaded_at: new Date().toISOString()
          }),
          3,
          'manual_upload'
        ]);

        imported.push({
          test_case_id: testCase.id,
          filename: file.name
        });
      } catch (error: any) {
        failed.push({ filename: file.name, error: error.message });
      }
    }

    // Handle ZIP file with multiple MP3s
    else if (file.name.toLowerCase().endsWith('.zip')) {
      // This is a simplified version - you'd need proper ZIP handling
      // For now, just show the concept

      return NextResponse.json({
        success: false,
        message: 'ZIP upload coming soon! For now, upload individual MP3s.',
        note: 'You mentioned 1249 calls - we can batch process them!'
      });
    }

    return NextResponse.json({
      success: true,
      message: `Imported ${imported.length} test calls`,
      imported: imported.length,
      failed: failed.length,
      details: { imported, failed }
    });

  } catch (error: any) {
    console.error('[Upload] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to upload calls' },
      { status: 500 }
    );
  }
}