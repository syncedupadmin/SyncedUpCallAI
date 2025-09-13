// Simple Convoso Recording Extractor
// Paste this in browser console on Convoso page

// Look for audio elements
document.querySelectorAll('audio').forEach(a => {
  if (a.src) console.log('Audio:', a.src);
});

// Look for MP3 links
document.querySelectorAll('a').forEach(a => {
  if (a.href && a.href.includes('.mp3')) {
    console.log('MP3 Link:', a.href);
  }
});

// Look for play buttons
document.querySelectorAll('button').forEach(b => {
  const onclick = b.onclick ? b.onclick.toString() : '';
  if (onclick.includes('http')) {
    console.log('Button URL:', onclick);
  }
});

console.log('\nIf nothing found, try:');
console.log('1. Open Network tab (F12)');
console.log('2. Click play on recording');
console.log('3. Look for MP3 file in Network tab');