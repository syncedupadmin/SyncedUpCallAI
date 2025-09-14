import { db } from './src/server/db.ts';

async function finalCheck() {
  try {
    const counts = await db.one(`
      SELECT
        (SELECT COUNT(*) FROM transcripts) as transcripts,
        (SELECT COUNT(*) FROM analyses) as analyses,
        (SELECT COUNT(*) FROM call_events) as events
    `);

    console.log('FINAL Database Counts:');
    console.log('- Transcripts:', counts.transcripts);
    console.log('- Analyses:', counts.analyses);
    console.log('- Events:', counts.events);

    // Check if embeddings tables exist and have data
    const embeddingsTables = await db.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('embeddings_meta', 'transcript_embeddings')
    `);

    console.log('\nEmbedding Tables Status:');
    if (!embeddingsTables || embeddingsTables.length === 0) {
      console.log('- No embedding tables found');
    } else {
      for (const table of embeddingsTables) {
        const countResult = await db.one(`SELECT COUNT(*) as count FROM ${table.table_name}`);
        console.log(`- ${table.table_name}: ${countResult.count} rows`);
      }
    }

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

finalCheck();