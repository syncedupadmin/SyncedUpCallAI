import { db } from './src/server/db.ts';

async function checkTables() {
  try {
    const counts = await db.one(`
      SELECT
        (SELECT COUNT(*) FROM calls) as calls,
        (SELECT COUNT(*) FROM transcripts) as transcripts,
        (SELECT COUNT(*) FROM analyses) as analyses,
        (SELECT COUNT(*) FROM call_events) as events
    `);

    console.log('Table counts:');
    console.log('- Calls:', counts.calls);
    console.log('- Transcripts:', counts.transcripts);
    console.log('- Analyses:', counts.analyses);
    console.log('- Events:', counts.events);

    // Check for embeddings tables
    const embTables = await db.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name LIKE '%embed%'
    `);

    console.log('\nEmbeddings tables:');
    if (embTables.length === 0) {
      console.log('- No embeddings tables found');
    } else {
      for (const t of embTables) {
        const count = await db.one(`SELECT COUNT(*) as count FROM ${t.table_name}`);
        console.log(`- ${t.table_name}: ${count.count} rows`);
      }
    }

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

checkTables();