#!/usr/bin/env node

/**
 * Test Convoso API connection and authentication
 */

const CONVOSO_AUTH_TOKEN = process.env.CONVOSO_AUTH_TOKEN;

if (!CONVOSO_AUTH_TOKEN) {
  console.error('Error: CONVOSO_AUTH_TOKEN environment variable is required');
  console.error('Set it in PowerShell: $env:CONVOSO_AUTH_TOKEN="your-token-here"');
  process.exit(1);
}

console.log('Testing Convoso API connection...');
console.log('Auth token:', CONVOSO_AUTH_TOKEN.substring(0, 10) + '...');
console.log('');

async function testAPI() {
  // Test basic API endpoint
  const params = new URLSearchParams({
    auth_token: CONVOSO_AUTH_TOKEN,
    offset: 0,
    limit: 1
  });

  const url = `https://api.convoso.com/v1/lead/get-recordings?${params}`;
  
  console.log('Request URL:', url);
  console.log('');
  
  try {
    console.log('Sending request...');
    const response = await fetch(url);
    
    console.log('Response status:', response.status);
    console.log('Response headers:');
    console.log('  Content-Type:', response.headers.get('content-type'));
    console.log('');
    
    const text = await response.text();
    
    // Try to parse as JSON
    try {
      const data = JSON.parse(text);
      console.log('Response is valid JSON:');
      console.log(JSON.stringify(data, null, 2));
    } catch (e) {
      console.log('Response is not JSON. First 500 characters:');
      console.log(text.substring(0, 500));
      console.log('');
      
      if (text.includes('<!DOCTYPE') || text.includes('<html')) {
        console.log('⚠️  API returned HTML instead of JSON');
        console.log('This usually means:');
        console.log('  1. The auth token is invalid or expired');
        console.log('  2. The API endpoint URL is incorrect');
        console.log('  3. You need to use a different authentication method');
        console.log('');
        console.log('Check the Convoso API documentation for:');
        console.log('  - Correct API endpoint URL');
        console.log('  - Required authentication headers or parameters');
        console.log('  - Any additional required parameters');
      }
    }
  } catch (error) {
    console.error('Request failed:', error.message);
  }
}

testAPI().catch(console.error);