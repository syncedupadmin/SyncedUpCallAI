import fetch from 'node-fetch';

async function testAPI() {
  try {
    console.log('Testing /api/ai-config/current endpoint...\n');

    const response = await fetch('http://localhost:3000/api/ai-config/current', {
      headers: {
        'Cookie': 'su_admin=true'
      }
    });

    const data = await response.json();

    console.log('Response Status:', response.status);
    console.log('\n=== CONFIG DATA ===');
    console.log('Config Name:', data.config?.name);
    console.log('Keywords Count:', data.config?.keywords_count);
    console.log('Replacements Count:', data.config?.replacements_count);

    console.log('\n=== KEYWORDS (first 10) ===');
    const keywords = data.config?.config?.keywords || [];
    keywords.slice(0, 10).forEach((kw, idx) => {
      console.log(`${idx + 1}. ${kw}`);
    });

    console.log('\n=== ANALYSIS ===');
    console.log('Total Keywords:', data.analysis?.totalKeywords);
    console.log('Accuracy Score:', data.analysis?.accuracyScore);
    console.log('Overtuning Status:', data.analysis?.overtuningStatus);
    console.log('Problematic Keywords:', data.analysis?.problematicKeywords);

    // Save full response for inspection
    console.log('\n=== FULL KEYWORDS ARRAY ===');
    console.log(JSON.stringify(keywords, null, 2));

  } catch (error) {
    console.error('Error:', error.message);
  }
}

testAPI();