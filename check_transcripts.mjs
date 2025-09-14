import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { db } from './src/server/db.ts';

async function checkTranscripts() {
  try {
    // Get first transcript with text
    const transcript = await db.oneOrNone(`
      SELECT call_id,
             LEFT(text, 100) as text_preview,
             LENGTH(text) as text_length
      FROM transcripts
      WHERE text IS NOT NULL
      LIMIT 1
    `);

    if (transcript) {
      console.log('Found transcript:');
      console.log('- Call ID:', transcript.call_id);
      console.log('- Text length:', transcript.text_length);
      console.log('- Preview:', transcript.text_preview);

      // Check if it has embedding
      const embedding = await db.oneOrNone(`
        SELECT call_id FROM transcript_embeddings
        WHERE call_id = $1
      `, [transcript.call_id]);

      console.log('- Has embedding:', !!embedding);

      // Check if it has analysis
      const analysis = await db.oneOrNone(`
        SELECT call_id FROM analyses
        WHERE call_id = $1
      `, [transcript.call_id]);

      console.log('- Has analysis:', !!analysis);

      return transcript.call_id;
    } else {
      console.log('No transcripts found with text');
      return null;
    }
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    process.exit(0);
  }
}

checkTranscripts();