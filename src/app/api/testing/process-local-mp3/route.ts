import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// POST /api/testing/process-local-mp3 - Process MP3 files from local directory
export async function POST(req: NextRequest) {
  try {
    const { directory = 'C:\\Users\\nicho\\Downloads\\iokjakye7l' } = await req.json();

    console.log('[Process MP3] Starting to process local MP3 files from:', directory);

    // Get list of MP3 files
    const files = fs.readdirSync(directory).filter(f => f.endsWith('.mp3'));
    console.log(`[Process MP3] Found ${files.length} MP3 files`);

    if (files.length === 0) {
      return NextResponse.json({ error: 'No MP3 files found' }, { status: 400 });
    }

    // Copy files to public directory so they can be served
    const publicDir = path.join(process.cwd(), 'public', 'test-audio');
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }

    const imported = [];
    const suiteId = '876b6b65-ddaa-42fe-aecd-80457cb66035';

    // Process first 20 files as a test
    const filesToProcess = files.slice(0, 20);

    for (const file of filesToProcess) {
      try {
        // Copy file to public directory
        const sourcePath = path.join(directory, file);
        const destPath = path.join(publicDir, file);
        fs.copyFileSync(sourcePath, destPath);

        // Create URL for the file
        const audioUrl = `/test-audio/${file}`;

        // Create test case in database
        const testCase = await db.one(`
          INSERT INTO ai_test_cases (
            suite_id,
            name,
            audio_url,
            audio_duration_sec,
            test_category,
            metadata,
            difficulty_level,
            source,
            is_active
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
          ON CONFLICT (audio_url) DO UPDATE SET name = EXCLUDED.name
          RETURNING id
        `, [
          suiteId,
          file.replace('.mp3', ''),
          audioUrl,
          30,
          'phone_quality',
          JSON.stringify({
            original_file: file,
            imported_at: new Date().toISOString()
          }),
          3,
          'local_import'
        ]);

        imported.push({
          id: testCase.id,
          file: file,
          url: audioUrl
        });

        console.log(`[Process MP3] Created test case for ${file}`);
      } catch (error: any) {
        console.error(`[Process MP3] Failed to process ${file}:`, error);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Processed ${imported.length} MP3 files`,
      imported: imported.length,
      total_files: files.length,
      test_cases: imported
    });

  } catch (error: any) {
    console.error('[Process MP3] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process MP3 files' },
      { status: 500 }
    );
  }
}