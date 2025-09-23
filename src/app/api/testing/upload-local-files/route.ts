import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/server/db';
import fs from 'fs/promises';
import path from 'path';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes for processing many files

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { directory_path, suite_id, max_files = 50 } = await request.json();

    if (!directory_path) {
      return NextResponse.json({ error: 'Directory path required' }, { status: 400 });
    }

    // Get or create suite
    let actualSuiteId = suite_id;
    if (!actualSuiteId) {
      const suite = await db.one(`
        INSERT INTO test_suites (name, description, created_by, status)
        VALUES ($1, $2, $3, 'active')
        RETURNING id
      `, [
        `Bulk Upload ${new Date().toISOString().split('T')[0]}`,
        `Uploaded from local directory: ${path.basename(directory_path)}`,
        user.id
      ]);
      actualSuiteId = suite.id;
    }

    // Read directory
    const files = await fs.readdir(directory_path);
    const mp3Files = files.filter(f => f.endsWith('.mp3')).slice(0, max_files);

    if (mp3Files.length === 0) {
      return NextResponse.json({ error: 'No MP3 files found' }, { status: 400 });
    }

    const results = {
      suite_id: actualSuiteId,
      total_files: mp3Files.length,
      uploaded: 0,
      imported: 0,
      failed: 0,
      errors: [] as any[]
    };

    // Process each file
    for (const fileName of mp3Files) {
      try {
        const filePath = path.join(directory_path, fileName);

        // Read file
        const fileBuffer = await fs.readFile(filePath);
        const fileSize = fileBuffer.length;

        // Extract info from filename (pattern: account_campaign_leadid_agentid_list_timestamp_etc.mp3)
        const parts = fileName.replace('.mp3', '').split('_');
        const leadId = parts[2] || 'unknown';
        const agentId = parts[3] || 'unknown';
        const timestamp = parts[5] || Date.now().toString();

        // Upload to Supabase Storage
        const storagePath = `test-audio/${actualSuiteId}/${fileName}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('call-recordings')
          .upload(storagePath, fileBuffer, {
            contentType: 'audio/mpeg',
            upsert: true
          });

        if (uploadError) {
          throw uploadError;
        }

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from('call-recordings')
          .getPublicUrl(storagePath);

        results.uploaded++;

        // Create test case
        const testCase = await db.one(`
          INSERT INTO test_cases (
            suite_id,
            name,
            description,
            audio_url,
            ground_truth,
            metadata,
            created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
          RETURNING id
        `, [
          actualSuiteId,
          `Test ${leadId} - Agent ${agentId}`,
          `Uploaded from ${fileName}`,
          publicUrl,
          '', // No ground truth yet - will be filled by first transcription
          JSON.stringify({
            original_filename: fileName,
            file_size: fileSize,
            lead_id: leadId,
            agent_id: agentId,
            timestamp: timestamp,
            uploaded_at: new Date().toISOString()
          })
        ]);

        results.imported++;

      } catch (error: any) {
        results.failed++;
        results.errors.push({
          file: fileName,
          error: error.message
        });
        console.error(`Failed to process ${fileName}:`, error);
      }
    }

    return NextResponse.json({
      success: true,
      ...results,
      message: `Successfully uploaded ${results.uploaded} files and imported ${results.imported} test cases`
    });

  } catch (error: any) {
    console.error('Bulk upload failed:', error);
    return NextResponse.json(
      { error: 'Bulk upload failed', message: error.message },
      { status: 500 }
    );
  }
}

// GET endpoint to check status
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Return instructions
    return NextResponse.json({
      endpoint: '/api/testing/upload-local-files',
      method: 'POST',
      description: 'Upload MP3 files from local directory to testing system',
      required_params: {
        directory_path: 'Full path to directory containing MP3 files'
      },
      optional_params: {
        suite_id: 'ID of existing test suite (will create new if not provided)',
        max_files: 'Maximum number of files to process (default: 50)'
      },
      example: {
        directory_path: 'C:\\Users\\nicho\\Downloads\\iokjakye7l',
        max_files: 10
      }
    });

  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to get info', message: error.message },
      { status: 500 }
    );
  }
}