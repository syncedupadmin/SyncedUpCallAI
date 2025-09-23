import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/server/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // 1 minute per file

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const suiteId = formData.get('suite_id') as string;
    const filename = formData.get('filename') as string || file.name;
    const metadataStr = formData.get('metadata') as string;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!suiteId) {
      return NextResponse.json({ error: 'Suite ID required' }, { status: 400 });
    }

    // Verify suite exists
    const suite = await db.oneOrNone(
      'SELECT id FROM test_suites WHERE id = $1',
      [suiteId]
    );

    if (!suite) {
      return NextResponse.json({ error: 'Test suite not found' }, { status: 404 });
    }

    // Parse metadata if provided
    let metadata = {};
    if (metadataStr) {
      try {
        metadata = JSON.parse(metadataStr);
      } catch (e) {
        metadata = { raw: metadataStr };
      }
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to Supabase Storage
    const storagePath = `test-audio/${suiteId}/${filename}`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('call-recordings')
      .upload(storagePath, buffer, {
        contentType: 'audio/mpeg',
        upsert: true
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return NextResponse.json(
        { error: 'Failed to upload file', details: uploadError.message },
        { status: 500 }
      );
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('call-recordings')
      .getPublicUrl(storagePath);

    // Extract info from filename if possible
    const parts = filename.replace('.mp3', '').split('_');
    let testName = filename;
    if (parts.length > 3) {
      const leadId = parts[2] || 'unknown';
      const agentId = parts[3] || 'unknown';
      testName = `Call ${leadId} - Agent ${agentId}`;
    }

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
      RETURNING id, name
    `, [
      suiteId,
      testName,
      `Uploaded from ${filename}`,
      publicUrl,
      '', // Ground truth will be filled on first transcription
      JSON.stringify({
        ...metadata,
        original_filename: filename,
        file_size: file.size,
        uploaded_at: new Date().toISOString(),
        uploaded_by: user.id
      })
    ]);

    return NextResponse.json({
      success: true,
      test_case_id: testCase.id,
      test_case_name: testCase.name,
      audio_url: publicUrl,
      message: 'File uploaded successfully'
    });

  } catch (error: any) {
    console.error('Upload failed:', error);
    return NextResponse.json(
      { error: 'Upload failed', message: error.message },
      { status: 500 }
    );
  }
}