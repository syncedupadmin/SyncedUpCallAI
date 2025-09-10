import { db } from './db';

export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY!}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Embedding generation failed: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

export async function upsertEmbedding(callId: string, text: string): Promise<void> {
  try {
    const embedding = await generateEmbedding(text);
    
    await db.none(`
      insert into transcript_embeddings(call_id, embedding, created_at)
      values($1, $2, now())
      on conflict (call_id) do update set
        embedding = $2,
        created_at = now()
    `, [callId, embedding]);

    await db.none(`
      insert into call_events(call_id, type, payload)
      values($1, 'embedding_created', $2)
    `, [callId, { model: 'text-embedding-3-small', dims: 1536 }]);
  } catch (error) {
    console.error(`Failed to create embedding for call ${callId}:`, error);
    
    await db.none(`
      insert into call_events(call_id, type, payload)
      values($1, 'embedding_failed', $2)
    `, [callId, { error: String(error) }]);
    
    throw error;
  }
}

export async function ensureEmbedding(callId: string): Promise<boolean> {
  // Check if embedding already exists
  const existing = await db.oneOrNone(`
    select call_id from transcript_embeddings where call_id = $1
  `, [callId]);

  if (existing) {
    return false; // Already exists
  }

  // Get transcript text (prefer translated, fallback to original)
  const transcript = await db.oneOrNone(`
    select coalesce(translated_text, text) as content
    from transcripts
    where call_id = $1
  `, [callId]);

  if (!transcript?.content) {
    throw new Error('No transcript text available for embedding');
  }

  await upsertEmbedding(callId, transcript.content);
  return true; // Created new embedding
}