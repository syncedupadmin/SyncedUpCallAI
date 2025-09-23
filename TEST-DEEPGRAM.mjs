// Direct test of Deepgram API
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY || 'ad6028587d6133caa78db69adb0e65b4adbcb3a9';
// Test with actual call recording from our server
const TEST_URL = 'https://synced-up-call-ai.vercel.app/test-audio/103833_1110454_2027107388_10489711_4123_1758578091_9167-in-1758578091.mp3';

console.log('Testing Deepgram API directly...');
console.log('API Key:', DEEPGRAM_API_KEY.substring(0, 10) + '...');
console.log('Audio URL:', TEST_URL);

const resp = await fetch('https://api.deepgram.com/v1/listen?' + new URLSearchParams({
  punctuate: 'true',
  diarize: 'true',
  utterances: 'true',
  detect_language: 'true',
  paragraphs: 'true',
  smart_format: 'true',
  model: 'nova-2'
}), {
  method: 'POST',
  headers: {
    'Authorization': `Token ${DEEPGRAM_API_KEY}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ url: TEST_URL })
});

console.log('\nResponse status:', resp.status, resp.statusText);

if (!resp.ok) {
  const error = await resp.text();
  console.error('Error response:', error);
  process.exit(1);
}

const data = await resp.json();
const channel = data.results?.channels?.[0];
const alternative = channel?.alternatives?.[0];

if (!alternative) {
  console.error('No transcription available');
  console.log('Full response:', JSON.stringify(data, null, 2));
  process.exit(1);
}

console.log('\n✅ SUCCESS!');
console.log('Language:', channel?.detected_language || 'unknown');
console.log('Confidence:', alternative.confidence);
console.log('Transcript length:', alternative.transcript?.length || 0);
console.log('First 200 chars:', alternative.transcript?.substring(0, 200));
console.log('\nDeepgram API is working correctly!');