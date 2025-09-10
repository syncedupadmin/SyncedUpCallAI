import { createHash } from 'crypto';
import { db } from '../db';

interface EmbeddingCheck {
  callId: string;
  text: string;
  model?: string;
  version?: string;
}

interface EmbeddingMeta {
  callId: string;
  textHash: string;
  model: string;
  version: string;
}

/**
 * Generate SHA256 hash of text for deduplication
 */
export function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * Check if we should skip embedding generation
 */
export async function shouldSkipEmbedding({
  callId,
  text,
  model = 'text-embedding-3-small',
  version = 'v1'
}: EmbeddingCheck): Promise<{ skip: boolean; reason?: string }> {
  try {
    const textHash = hashText(text);
    
    // Check if embedding already exists with same hash and model
    const existing = await db.oneOrNone(`
      SELECT call_id, text_hash, model, model_version, created_at
      FROM transcript_embeddings
      WHERE call_id = $1 
        AND text_hash = $2 
        AND model = $3 
        AND model_version = $4
    `, [callId, textHash, model, version]);

    if (existing) {
      return {
        skip: true,
        reason: `Embedding exists (hash: ${textHash.substring(0, 8)}..., created: ${existing.created_at})`
      };
    }

    // Also check if we have an embedding for this call with the same model
    // but different text (text might have been updated)
    const callEmbedding = await db.oneOrNone(`
      SELECT call_id, text_hash, model, model_version
      FROM transcript_embeddings
      WHERE call_id = $1 AND model = $3 AND model_version = $4
    `, [callId, model, version]);

    if (callEmbedding && callEmbedding.text_hash === textHash) {
      return {
        skip: true,
        reason: 'Embedding already exists for this call and text'
      };
    }

    return { skip: false };
  } catch (error) {
    console.error('Error checking embedding skip:', error);
    // On error, don't skip to ensure we have embeddings
    return { skip: false };
  }
}

/**
 * Record embedding metadata after successful generation
 */
export async function recordEmbeddingMeta({
  callId,
  textHash,
  model,
  version
}: EmbeddingMeta): Promise<void> {
  try {
    await db.none(`
      UPDATE transcript_embeddings
      SET text_hash = $2,
          model = $3,
          model_version = $4
      WHERE call_id = $1
    `, [callId, textHash, model, version]);

    // Log the metadata update
    await db.none(`
      INSERT INTO call_events(call_id, type, payload)
      VALUES($1, 'embedding_meta_recorded', $2)
    `, [callId, {
      text_hash: textHash.substring(0, 16),
      model,
      model_version: version
    }]);
  } catch (error) {
    console.error('Error recording embedding metadata:', error);
    throw error;
  }
}

/**
 * Enhanced embedding generation with caching
 */
export async function generateEmbeddingWithCache(
  callId: string,
  text: string,
  generateFn: (text: string) => Promise<number[]>,
  model = 'text-embedding-3-small',
  version = 'v1'
): Promise<{ embedding?: number[]; skipped: boolean; reason?: string }> {
  // Check if we should skip
  const skipCheck = await shouldSkipEmbedding({ callId, text, model, version });
  
  if (skipCheck.skip) {
    // Log skip event
    await db.none(`
      INSERT INTO call_events(call_id, type, payload)
      VALUES($1, 'embedding_skip', $2)
    `, [callId, { reason: skipCheck.reason, model, version }]);

    return { skipped: true, reason: skipCheck.reason };
  }

  // Generate new embedding
  try {
    const embedding = await generateFn(text);
    const textHash = hashText(text);

    // Record metadata
    await recordEmbeddingMeta({ callId, textHash, model, version });

    return { embedding, skipped: false };
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw error;
  }
}