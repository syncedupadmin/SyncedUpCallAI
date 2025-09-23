import { Client } from "pg";

const DB = process.env.DATABASE_URL;
const SUITE_ID = '876b6b65-ddaa-42fe-aecd-80457cb66035';

const client = new Client({ connectionString: DB });
await client.connect();

console.log('Updating test cases to use real speech audio...\n');

try {
  // Update all test cases with SoundHelix URLs to use real call audio
  const result = await client.query(
    `UPDATE ai_test_cases
     SET audio_url = 'https://synced-up-call-ai.vercel.app/test-audio/103833_1110454_2027107388_10489711_4123_1758578091_9167-in-1758578091.mp3'
     WHERE suite_id = $1
     AND (audio_url LIKE '%soundhelix%' OR audio_url LIKE '%SoundHelix%')
     RETURNING id, audio_url`,
    [SUITE_ID]
  );

  if (result.rows.length > 0) {
    console.log(`✅ Updated ${result.rows.length} test case(s)`);
    result.rows.forEach(row => {
      console.log(`  - Test case ${row.id}`);
      console.log(`    New URL: ${row.audio_url}`);
    });
  } else {
    console.log('No test cases found with SoundHelix URLs');

    // Check current test cases
    const check = await client.query(
      'SELECT id, audio_url FROM ai_test_cases WHERE suite_id = $1 LIMIT 5',
      [SUITE_ID]
    );

    console.log(`\nCurrent test cases in suite ${SUITE_ID}:`);
    check.rows.forEach(row => {
      console.log(`  - ${row.id}: ${row.audio_url?.substring(0, 80)}...`);
    });
  }

} catch (error) {
  console.error('❌ Error:', error.message);
} finally {
  await client.end();
}