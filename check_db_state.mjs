import { db } from './src/server/db.ts';

async function checkState() {
  try {
    // Check current counts
    const counts = await db.one(`
      SELECT
        (SELECT COUNT(*) FROM transcripts) as transcripts,
        (SELECT COUNT(*) FROM analyses) as analyses
    `);

    console.log('BEFORE Migration:');
    console.log('- Transcripts:', counts.transcripts);
    console.log('- Analyses:', counts.analyses);

    // Check if tables exist
    const tables = await db.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('embeddings_meta', 'transcript_embeddings')
    `);

    console.log('\nEmbedding tables found:');
    tables.forEach(t => console.log('-', t.table_name));

    // If embeddings_meta exists, count rows
    if (tables.some(t => t.table_name === 'embeddings_meta')) {
      const meta = await db.one(`SELECT COUNT(*) as count FROM embeddings_meta`);
      console.log('- embeddings_meta rows:', meta.count);
    }

    // If transcript_embeddings exists, count rows
    if (tables.some(t => t.table_name === 'transcript_embeddings')) {
      const emb = await db.one(`SELECT COUNT(*) as count FROM transcript_embeddings`);
      console.log('- transcript_embeddings rows:', emb.count);
    }

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

checkState();