#!/usr/bin/env node

/**
 * Demo Seed Script for SyncedUp Call AI
 * Creates 3 sample calls with various states of data
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

// Generate a UUID v4
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

async function seedDemo() {
  console.log('🌱 Starting demo seed...\n');
  
  try {
    // Create IDs
    const callA = generateUUID();
    const callB = generateUUID();
    const callC = generateUUID();
    
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    
    // Insert Call A - Full data (transcript + embeddings + analysis)
    console.log('Creating Call A (full data)...');
    await pool.query(`
      INSERT INTO calls (id, customer_phone, agent_name, disposition, started_at, duration_sec, convoso_audio_url)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (id) DO NOTHING
    `, [callA, '+15551234567', 'Demo Agent A', 'Answered', twoDaysAgo.toISOString(), 180, 'https://example.com/audio-a.mp3']);
    
    const transcriptA = 'Hello, this is a demo call transcript. The customer asked about our premium services and we discussed the benefits of our advanced coverage plan. The call went well and the customer was satisfied with the information provided.';
    const transcriptHashA = hashText(transcriptA);
    
    await pool.query(`
      INSERT INTO transcripts (call_id, text, lang, engine, created_at)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (call_id) DO UPDATE SET text = $2
    `, [callA, transcriptA, 'en', 'demo', now.toISOString()]);
    
    // Create embeddings for Call A
    const fakeEmbedding = new Array(1536).fill(0).map(() => Math.random());
    await pool.query(`
      INSERT INTO transcript_embeddings (call_id, embedding, text_hash, model, model_version, created_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (call_id) DO UPDATE SET 
        embedding = $2,
        text_hash = $3,
        model = $4,
        model_version = $5
    `, [callA, JSON.stringify(fakeEmbedding), transcriptHashA, 'text-embedding-3-small', 'v1', now.toISOString()]);
    
    // Add analysis for Call A
    await pool.query(`
      INSERT INTO analyses (call_id, qa_score, reason_primary, summary, script_adherence, created_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (call_id) DO UPDATE SET
        qa_score = $2,
        reason_primary = $3,
        summary = $4
    `, [callA, 92, 'information_provided', 'Customer inquired about premium services. Agent provided comprehensive information about coverage benefits.', 95, now.toISOString()]);
    
    console.log(`  ✓ Call A: ${callA}`);
    
    // Insert Call B - Transcript only (no embeddings)
    console.log('Creating Call B (transcript only)...');
    await pool.query(`
      INSERT INTO calls (id, customer_phone, agent_name, disposition, started_at, duration_sec, convoso_audio_url)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (id) DO NOTHING
    `, [callB, '+15559876543', 'Demo Agent B', 'Voicemail', yesterday.toISOString(), 45, 'https://example.com/audio-b.mp3']);
    
    const transcriptB = 'This is a voicemail message. The customer was not available. We will follow up tomorrow.';
    
    await pool.query(`
      INSERT INTO transcripts (call_id, text, lang, engine, created_at)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (call_id) DO UPDATE SET text = $2
    `, [callB, transcriptB, 'en', 'demo', now.toISOString()]);
    
    console.log(`  ✓ Call B: ${callB}`);
    
    // Insert Call C - Headers only (no transcript)
    console.log('Creating Call C (headers only)...');
    await pool.query(`
      INSERT INTO calls (id, customer_phone, agent_name, disposition, started_at, duration_sec, convoso_audio_url)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (id) DO NOTHING
    `, [callC, '+15555551212', 'Demo Agent C', 'No Answer', now.toISOString(), 0, null]);
    
    console.log(`  ✓ Call C: ${callC}`);
    
    // Add some call events
    console.log('\nAdding call events...');
    for (const callId of [callA, callB, callC]) {
      await pool.query(`
        INSERT INTO call_events (call_id, type, payload, created_at)
        VALUES ($1, $2, $3, $4)
      `, [callId, 'created', { source: 'seed_demo' }, now.toISOString()]);
    }
    
    // Verify the seed
    console.log('\n📊 Verification:');
    
    const callCount = await pool.query('SELECT COUNT(*) FROM calls WHERE id = ANY($1)', [[callA, callB, callC]]);
    console.log(`  Calls created: ${callCount.rows[0].count}/3`);
    
    const transcriptCount = await pool.query('SELECT COUNT(*) FROM transcripts WHERE call_id = ANY($1)', [[callA, callB, callC]]);
    console.log(`  Transcripts created: ${transcriptCount.rows[0].count}/2`);
    
    const embeddingCount = await pool.query('SELECT COUNT(*) FROM transcript_embeddings WHERE call_id = ANY($1)', [[callA, callB, callC]]);
    console.log(`  Embeddings created: ${embeddingCount.rows[0].count}/1`);
    
    const analysisCount = await pool.query('SELECT COUNT(*) FROM analyses WHERE call_id = ANY($1)', [[callA, callB, callC]]);
    console.log(`  Analyses created: ${analysisCount.rows[0].count}/1`);
    
    console.log('\n✅ Demo seed completed!');
    console.log('\nSeeded call IDs:');
    console.log(`  Call A (full): ${callA}`);
    console.log(`  Call B (transcript): ${callB}`);
    console.log(`  Call C (headers): ${callC}`);
    
  } catch (error) {
    console.error('❌ Seed error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run if called directly
if (require.main === module) {
  seedDemo().then(() => process.exit(0));
}

module.exports = { seedDemo };