import { db } from './src/server/db.ts';

async function findCallWithTranscript() {
  try {
    // Find a call with transcript
    const result = await db.oneOrNone(`
      SELECT t.call_id, t.created_at, c.recording_url
      FROM transcripts t
      JOIN calls c ON c.id = t.call_id
      WHERE t.text IS NOT NULL
      ORDER BY t.created_at DESC
      LIMIT 1
    `);

    if (result) {
      console.log('Found call with transcript:');
      console.log('Call ID:', result.call_id);
      console.log('Transcript created:', result.created_at);
      console.log('Has recording:', !!result.recording_url);
    } else {
      console.log('No calls with transcripts found');
    }

    // Check table counts
    const counts = await db.one(`
      SELECT
        (SELECT COUNT(*) FROM calls) as calls,
        (SELECT COUNT(*) FROM transcripts) as transcripts,
        (SELECT COUNT(*) FROM analyses) as analyses
    `);

    console.log('\nTable counts:');
    console.log('Calls:', counts.calls);
    console.log('Transcripts:', counts.transcripts);
    console.log('Analyses:', counts.analyses);

    // Check if embeddings tables exist
    const tables = await db.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('transcript_embeddings', 'embeddings', 'embeddings_meta')
    `);

    console.log('\nEmbeddings tables found:');
    tables.forEach(t => console.log('-', t.table_name));

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

findCallWithTranscript();