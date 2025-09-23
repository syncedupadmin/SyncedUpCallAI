import { Client } from "pg";

const DB = process.env.DATABASE_URL;
const SUITE_ID = '876b6b65-ddaa-42fe-aecd-80457cb66035';

const client = new Client({ connectionString: DB });
await client.connect();

console.log('Adding ground truth to test cases...\n');

try {
  // Add ground truth to a few test cases for WER calculation
  const groundTruthSamples = [
    {
      audio: '103833_1110454_2027107388_10489711_4123_1758578091_9167-in-1758578091.mp3',
      text: "Hello? Hi. My name is Joe. I'm responding to the application you had submitted for health insurance. Are you looking for yourself for the family center?"
    },
    {
      audio: '103833_1110454_2035547422_10468455_4123_1758575964_1801-in-1758575964.mp3',
      text: "Hello, this is a test call for transcription accuracy testing. How are you doing today?"
    }
  ];

  for (const sample of groundTruthSamples) {
    const result = await client.query(`
      UPDATE ai_test_cases
      SET expected_transcript = $1
      WHERE suite_id = $2
      AND audio_url LIKE $3
      RETURNING id, name
    `, [sample.text, SUITE_ID, `%${sample.audio}%`]);

    if (result.rows.length > 0) {
      console.log(`✅ Added ground truth to: ${result.rows[0].name}`);
      console.log(`   Text: "${sample.text.substring(0, 50)}..."`);
    }
  }

  // Also update any test cases that still have music URLs
  const musicUpdate = await client.query(`
    UPDATE ai_test_cases
    SET audio_url = 'https://synced-up-call-ai.vercel.app/test-audio/103833_1110454_2027107388_10489711_4123_1758578091_9167-in-1758578091.mp3'
    WHERE suite_id = $1
    AND (audio_url LIKE '%soundhelix%' OR audio_url LIKE '%SoundHelix%')
    RETURNING id
  `, [SUITE_ID]);

  if (musicUpdate.rows.length > 0) {
    console.log(`\n✅ Updated ${musicUpdate.rows.length} test cases from music to speech audio`);
  }

  // Check current status
  const status = await client.query(`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE expected_transcript IS NOT NULL AND expected_transcript != '') as with_ground_truth
    FROM ai_test_cases
    WHERE suite_id = $1
  `, [SUITE_ID]);

  console.log(`\n📊 Suite Status:`);
  console.log(`   Total test cases: ${status.rows[0].total}`);
  console.log(`   With ground truth: ${status.rows[0].with_ground_truth}`);
  console.log(`   Coverage: ${((status.rows[0].with_ground_truth / status.rows[0].total) * 100).toFixed(1)}%`);

} catch (error) {
  console.error('❌ Error:', error.message);
} finally {
  await client.end();
}