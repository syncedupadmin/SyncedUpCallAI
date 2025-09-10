#!/usr/bin/env node

/**
 * Backfill Script for Embeddings Metadata
 * Finds transcripts missing entries in embeddings_meta and updates them
 */

const pg = require('pg');
const crypto = require('crypto');

// Database connection
const pool = new pg.Pool({ 
  connectionString: process.env.DATABASE_URL 
});

// Helper to generate SHA256 hash
function hashText(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

async function backfillMeta() {
  console.log('🔄 Starting embeddings metadata backfill...\n');
  
  try {
    // Find transcripts with embeddings but missing text_hash or model info
    const missing = await pool.query(`
      SELECT 
        e.call_id,
        t.text,
        e.model,
        e.model_version,
        e.text_hash
      FROM transcript_embeddings e
      JOIN transcripts t ON t.call_id = e.call_id
      WHERE e.text_hash IS NULL 
         OR e.model IS NULL 
         OR e.model_version IS NULL
      LIMIT 100
    `);
    
    if (missing.rows.length === 0) {
      console.log('✅ No embeddings need metadata backfill');
      return;
    }
    
    console.log(`Found ${missing.rows.length} embeddings needing metadata`);
    
    let updated = 0;
    let skipped = 0;
    
    for (const row of missing.rows) {
      const { call_id, text } = row;
      
      if (!text) {
        console.log(`  ⚠️ Skipping ${call_id}: no transcript text`);
        skipped++;
        continue;
      }
      
      const textHash = hashText(text);
      const model = row.model || 'text-embedding-3-small';
      const modelVersion = row.model_version || 'v1';
      
      // Check if we already have an embedding with this hash (deduplication)
      const existing = await pool.query(`
        SELECT call_id 
        FROM transcript_embeddings 
        WHERE text_hash = $1 
          AND model = $2 
          AND model_version = $3
          AND call_id != $4
        LIMIT 1
      `, [textHash, model, modelVersion, call_id]);
      
      if (existing.rows.length > 0) {
        console.log(`  ⏭️ Skipping ${call_id}: duplicate hash exists (${existing.rows[0].call_id})`);
        skipped++;
        continue;
      }
      
      // Update the metadata
      await pool.query(`
        UPDATE transcript_embeddings
        SET 
          text_hash = $2,
          model = $3,
          model_version = $4,
          updated_at = NOW()
        WHERE call_id = $1
      `, [call_id, textHash, model, modelVersion]);
      
      console.log(`  ✓ Updated ${call_id} (hash: ${textHash.substring(0, 8)}...)`);
      updated++;
    }
    
    console.log('\n📊 Backfill Summary:');
    console.log(`  Updated: ${updated}`);
    console.log(`  Skipped: ${skipped}`);
    
    // Verify the backfill
    const remaining = await pool.query(`
      SELECT COUNT(*) as count
      FROM transcript_embeddings
      WHERE text_hash IS NULL 
         OR model IS NULL 
         OR model_version IS NULL
    `);
    
    console.log(`  Remaining without metadata: ${remaining.rows[0].count}`);
    
    if (remaining.rows[0].count > 0) {
      console.log('\n⚠️ Some embeddings still need metadata. Run again to process more.');
    } else {
      console.log('\n✅ All embeddings have metadata!');
    }
    
  } catch (error) {
    console.error('❌ Backfill error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run if called directly
if (require.main === module) {
  backfillMeta().then(() => process.exit(0));
}

module.exports = { backfillMeta };