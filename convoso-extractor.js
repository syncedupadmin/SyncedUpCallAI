// Convoso Recording URL Extractor
// Run this in your browser's console while on the Convoso page with recordings

console.log('🔍 Searching for recording URLs in Convoso...\n');

// Method 1: Look for audio elements
const audioElements = document.querySelectorAll('audio, audio source');
if (audioElements.length > 0) {
  console.log('Found audio elements:');
  audioElements.forEach((el, i) => {
    const src = el.src || el.getAttribute('src');
    if (src) {
      console.log(`Audio ${i + 1}: ${src}`);
    }
  });
}

// Method 2: Look for links with common audio extensions
const audioLinks = Array.from(document.querySelectorAll('a')).filter(a => {
  const href = a.href || '';
  return href.match(/\.(mp3|wav|m4a|ogg|webm)($|\?)/i);
});

if (audioLinks.length > 0) {
  console.log('\nFound audio links:');
  audioLinks.forEach((link, i) => {
    console.log(`Link ${i + 1}: ${link.href}`);
  });
}

// Method 3: Look for iframes that might contain players
const iframes = document.querySelectorAll('iframe');
if (iframes.length > 0) {
  console.log('\nFound iframes (might contain players):');
  iframes.forEach((iframe, i) => {
    console.log(`Iframe ${i + 1}: ${iframe.src}`);
  });
}

// Method 4: Search all onclick handlers and data attributes
const elementsWithData = document.querySelectorAll('[data-url], [data-src], [data-recording], [data-audio]');
if (elementsWithData.length > 0) {
  console.log('\nFound elements with data attributes:');
  elementsWithData.forEach((el, i) => {
    const attrs = ['data-url', 'data-src', 'data-recording', 'data-audio'];
    attrs.forEach(attr => {
      const val = el.getAttribute(attr);
      if (val) {
        console.log(`${attr}: ${val}`);
      }
    });
  });
}

// Method 5: Look for play buttons and their associated data
const playButtons = document.querySelectorAll('[class*="play"], [id*="play"], button[title*="play" i], button[aria-label*="play" i]');
if (playButtons.length > 0) {
  console.log('\nFound play buttons - check their onclick or data:');
  playButtons.forEach((btn, i) => {
    // Check onclick
    const onclick = btn.getAttribute('onclick');
    if (onclick && onclick.includes('http')) {
      console.log(`Button ${i + 1} onclick: ${onclick}`);
    }
    
    // Check all data attributes
    Array.from(btn.attributes).forEach(attr => {
      if (attr.name.startsWith('data-') && attr.value.includes('http')) {
        console.log(`Button ${i + 1} ${attr.name}: ${attr.value}`);
      }
    });
  });
}

// Method 6: Search in all script tags for URLs
const scripts = Array.from(document.querySelectorAll('script')).map(s => s.innerHTML).join('\n');
const urlMatches = scripts.match(/https?:\/\/[^\s"']+\.(mp3|wav|m4a|ogg|webm)(\?[^\s"']*)?/gi);
if (urlMatches) {
  console.log('\nFound URLs in scripts:');
  [...new Set(urlMatches)].forEach(url => {
    console.log(url);
  });
}

// Method 7: Network tab instruction
console.log('\n📡 Alternative method:');
console.log('1. Open Developer Tools (F12)');
console.log('2. Go to Network tab');
console.log('3. Filter by "Media" or "XHR"');
console.log('4. Click play on a recording');
console.log('5. Look for the MP3/audio file request');
console.log('6. Right-click → Copy → Copy link address');

console.log('\n✅ Search complete! If no URLs found above, try the Network tab method.');