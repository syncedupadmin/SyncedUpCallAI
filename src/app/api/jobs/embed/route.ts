import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/server/db';
import { sha256 } from '@/src/server/lib/embeddings';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    // Auth check
    const authHeader = req.headers.get('x-jobs-secret');
    if (authHeader !== process.env.JOBS_SECRET) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Parse input
    const { call_id } = await req.json();
    if (!call_id) {
      return NextResponse.json({ ok: false, error: 'call_id required' }, { status: 400 });
    }

    // Fetch transcript
    const transcript = await db.oneOrNone(`
      SELECT text FROM transcripts
      WHERE call_id = $1
      LIMIT 1
    `, [call_id]);

    if (!transcript || !transcript.text) {
      return NextResponse.json({ ok: false, error: 'no_transcript' }, { status: 404 });
    }

    // Compute hash for cache check
    const model = 'text-embedding-3-small';
    const cacheKey = `${model}:${transcript.text}`;
    const textHash = sha256(cacheKey);

    // Check cache in embeddings_meta
    const cached = await db.oneOrNone(`
      SELECT 1 FROM embeddings_meta
      WHERE call_id = $1 AND text_sha256 = $2
      LIMIT 1
    `, [call_id, textHash]);

    if (cached) {
      return NextResponse.json({ ok: true, status: 'exists' });
    }

    // Truncate if too long (OpenAI has token limits)
    let truncated = false;
    let inputText = transcript.text;
    const MAX_CHARS = 30000; // ~8k tokens for text-embedding-3-small

    if (inputText.length > MAX_CHARS) {
      inputText = inputText.substring(0, MAX_CHARS);
      truncated = true;
    }

    // Call OpenAI embeddings API
    const openAIResponse = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model,
        input: inputText
      })
    });

    if (!openAIResponse.ok) {
      const error = await openAIResponse.text();
      console.error('OpenAI embedding error:', openAIResponse.status, error);
      return NextResponse.json({
        ok: false,
        error: 'embedding_api_error',
        status: openAIResponse.status,
        detail: error.substring(0, 200)
      }, { status: 500 });
    }

    const embeddingData = await openAIResponse.json();
    const embedding = embeddingData.data[0].embedding;

    // Insert or update transcript_embeddings
    await db.none(`
      INSERT INTO transcript_embeddings (call_id, embedding)
      VALUES ($1, $2::vector)
      ON CONFLICT (call_id)
      DO UPDATE SET embedding = $2::vector
    `, [call_id, JSON.stringify(embedding)]);

    // Insert embeddings_meta for cache tracking (only if not exists)
    const existingMeta = await db.oneOrNone(`
      SELECT 1 FROM embeddings_meta
      WHERE call_id = $1 AND text_sha256 = $2
      LIMIT 1
    `, [call_id, textHash]);

    if (!existingMeta) {
      await db.none(`
        INSERT INTO embeddings_meta (call_id, text_sha256, model, model_version, created_at)
        VALUES ($1, $2, $3, 'v1', NOW())
      `, [call_id, textHash, model]);
    }

    // Log event
    await db.none(`
      INSERT INTO call_events (call_id, type, payload)
      VALUES ($1, 'embedding_created', $2)
    `, [call_id, {
      model,
      truncated,
      text_length: transcript.text.length,
      hash_prefix: textHash.substring(0, 8)
    }]);

    return NextResponse.json({
      ok: true,
      status: 'created',
      ...(truncated && { truncated: true })
    });

  } catch (error: any) {
    console.error('jobs/embed error:', error);
    return NextResponse.json({
      ok: false,
      error: 'server_error',
      message: error.message
    }, { status: 500 });
  }
}