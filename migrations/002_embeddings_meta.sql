-- Add metadata columns for embedding caching and versioning
ALTER TABLE transcript_embeddings
  ADD COLUMN IF NOT EXISTS text_hash text,
  ADD COLUMN IF NOT EXISTS model text DEFAULT 'text-embedding-3-small',
  ADD COLUMN IF NOT EXISTS model_version text DEFAULT 'v1';

-- Create composite index for efficient cache lookups
CREATE INDEX IF NOT EXISTS idx_embed_call_hash 
  ON transcript_embeddings(call_id, text_hash, model, model_version);

-- Add comment for documentation
COMMENT ON COLUMN transcript_embeddings.text_hash IS 'SHA256 hash of the input text for deduplication';
COMMENT ON COLUMN transcript_embeddings.model IS 'Embedding model name (e.g., text-embedding-3-small)';
COMMENT ON COLUMN transcript_embeddings.model_version IS 'Model version for cache invalidation';