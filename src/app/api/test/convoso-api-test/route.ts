import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Test different Convoso API endpoints to find the correct one
export async function POST(req: NextRequest) {
  try {
    const { user_email } = await req.json();

    if (!user_email) {
      return NextResponse.json({
        ok: false,
        error: 'user_email is required'
      }, { status: 400 });
    }

    const authToken = process.env.CONVOSO_AUTH_TOKEN;
    if (!authToken) {
      return NextResponse.json({
        ok: false,
        error: 'CONVOSO_AUTH_TOKEN not configured'
      }, { status: 500 });
    }

    const results: any = {};

    // Test 1: POST to /api/users/get-recordings
    try {
      const url1 = 'https://secure.convoso.com/api/users/get-recordings';
      const response1 = await fetch(url1, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auth_token: authToken,
          user: user_email
        })
      });
      results.post_users_get_recordings = {
        status: response1.status,
        statusText: response1.statusText,
        ok: response1.ok,
        headers: Object.fromEntries(response1.headers.entries())
      };
      if (response1.ok) {
        results.post_users_get_recordings.data = await response1.json();
      } else {
        results.post_users_get_recordings.error = await response1.text();
      }
    } catch (e: any) {
      results.post_users_get_recordings = { error: e.message };
    }

    // Test 2: GET with query params
    try {
      const params = new URLSearchParams({
        auth_token: authToken,
        user: user_email
      });
      const url2 = `https://secure.convoso.com/api/users/get-recordings?${params}`;
      const response2 = await fetch(url2, { method: 'GET' });
      results.get_users_get_recordings = {
        status: response2.status,
        statusText: response2.statusText,
        ok: response2.ok
      };
      if (response2.ok) {
        results.get_users_get_recordings.data = await response2.json();
      } else {
        results.get_users_get_recordings.error = await response2.text();
      }
    } catch (e: any) {
      results.get_users_get_recordings = { error: e.message };
    }

    // Test 3: Try v1 API endpoint
    try {
      const url3 = 'https://api.convoso.com/v1/users/recordings';
      const response3 = await fetch(url3, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auth_token: authToken,
          user: user_email
        })
      });
      results.v1_users_recordings = {
        status: response3.status,
        statusText: response3.statusText,
        ok: response3.ok
      };
      if (response3.ok) {
        results.v1_users_recordings.data = await response3.json();
      } else {
        results.v1_users_recordings.error = await response3.text();
      }
    } catch (e: any) {
      results.v1_users_recordings = { error: e.message };
    }

    // Test 4: Try with form data instead of JSON
    try {
      const url4 = 'https://secure.convoso.com/api/users/get-recordings';
      const formData = new FormData();
      formData.append('auth_token', authToken);
      formData.append('user', user_email);

      const response4 = await fetch(url4, {
        method: 'POST',
        body: formData
      });
      results.post_formdata = {
        status: response4.status,
        statusText: response4.statusText,
        ok: response4.ok
      };
      if (response4.ok) {
        results.post_formdata.data = await response4.json();
      } else {
        results.post_formdata.error = await response4.text();
      }
    } catch (e: any) {
      results.post_formdata = { error: e.message };
    }

    // Test 5: Try URL-encoded form data
    try {
      const url5 = 'https://secure.convoso.com/api/users/get-recordings';
      const params = new URLSearchParams();
      params.append('auth_token', authToken);
      params.append('user', user_email);

      const response5 = await fetch(url5, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString()
      });
      results.post_urlencoded = {
        status: response5.status,
        statusText: response5.statusText,
        ok: response5.ok
      };
      if (response5.ok) {
        results.post_urlencoded.data = await response5.json();
      } else {
        results.post_urlencoded.error = await response5.text();
      }
    } catch (e: any) {
      results.post_urlencoded = { error: e.message };
    }

    return NextResponse.json({
      ok: true,
      message: 'Convoso API endpoint tests completed',
      user_email,
      auth_token_configured: !!authToken,
      results,
      recommendation: 'Check which endpoint returned ok:true and use that format'
    });

  } catch (error: any) {
    return NextResponse.json({
      ok: false,
      error: error.message
    }, { status: 500 });
  }
}

// GET endpoint to test basic connectivity
export async function GET(req: NextRequest) {
  const authToken = process.env.CONVOSO_AUTH_TOKEN;

  return NextResponse.json({
    ok: true,
    message: 'Convoso API test endpoint',
    auth_token_configured: !!authToken,
    auth_token_length: authToken?.length || 0,
    instructions: {
      endpoint: 'POST /api/test/convoso-api-test',
      body: {
        user_email: 'agent@example.com'
      },
      purpose: 'Tests multiple Convoso API endpoint formats to find the correct one'
    }
  });
}