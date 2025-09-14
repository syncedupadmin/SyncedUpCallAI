import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { db } from './src/server/db.ts';

async function verifyCounts() {
  try {
    const counts = await db.one(`
      SELECT
        (SELECT COUNT(*) FROM transcript_embeddings) as transcript_embeddings,
        (SELECT COUNT(*) FROM embeddings_meta) as embeddings_meta,
        (SELECT COUNT(*) FROM analyses) as analyses
    `);

    console.log('Database Row Counts:');
    console.log('- transcript_embeddings:', counts.transcript_embeddings);
    console.log('- embeddings_meta:', counts.embeddings_meta);
    console.log('- analyses:', counts.analyses);

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

verifyCounts();