import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Diagnostic endpoint to find the correct Convoso API endpoints
export async function POST(req: NextRequest) {
  try {
    const { lead_id, user_email } = await req.json();

    if (!lead_id && !user_email) {
      return NextResponse.json({
        ok: false,
        error: 'Either lead_id or user_email is required'
      }, { status: 400 });
    }

    const authToken = process.env.CONVOSO_AUTH_TOKEN;
    if (!authToken) {
      return NextResponse.json({
        ok: false,
        error: 'CONVOSO_AUTH_TOKEN not configured'
      }, { status: 500 });
    }

    const results: any = {
      auth_token_present: true,
      auth_token_length: authToken.length,
      tests: []
    };

    // Test different URL patterns for lead-based recordings
    if (lead_id) {
      const leadEndpoints = [
        // Based on documentation - different variations
        'https://api.convoso.com/v1/lead/get-recordings',
        'https://api.convoso.com/v1/leads/get-recordings',
        'https://api.convoso.com/v1/lead/recordings',
        'https://api.convoso.com/v1/leads/recordings',
        'https://api.convoso.com/v1/recording/lead',
        'https://api.convoso.com/v1/recordings/lead',
        'https://api.convoso.com/api/lead/get-recordings',
        'https://api.convoso.com/api/leads/get-recordings',
        // Without v1
        'https://api.convoso.com/lead/get-recordings',
        'https://api.convoso.com/leads/get-recordings',
      ];

      for (const baseUrl of leadEndpoints) {
        const test: any = {
          endpoint: baseUrl,
          method: 'GET',
          params: { auth_token: authToken, lead_id }
        };

        try {
          const params = new URLSearchParams({
            auth_token: authToken,
            lead_id: lead_id.toString(),
            limit: '1'
          });

          const url = `${baseUrl}?${params}`;
          const response = await fetch(url, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
          });

          test.status = response.status;
          test.statusText = response.statusText;
          test.success = response.ok;

          if (response.ok) {
            try {
              const data = await response.json();
              test.response_sample = {
                has_success_field: 'success' in data,
                has_data_field: 'data' in data,
                has_entries: data.data?.entries ? true : false,
                entry_count: data.data?.entries?.length || 0,
                first_entry_keys: data.data?.entries?.[0] ? Object.keys(data.data.entries[0]) : []
              };
              test.working = true;
            } catch (e) {
              test.json_error = 'Failed to parse JSON';
            }
          } else if (response.status === 404) {
            test.error = '404 - Endpoint not found';
          } else if (response.status === 401) {
            test.error = '401 - Authentication failed';
          } else {
            const text = await response.text();
            test.error = text.substring(0, 200);
          }

        } catch (error: any) {
          test.network_error = error.message;
        }

        results.tests.push(test);

        // If we found a working endpoint, note it
        if (test.working) {
          results.WORKING_ENDPOINT = baseUrl;
          break; // Stop testing once we find one that works
        }
      }
    }

    // Test user-based endpoints
    if (user_email) {
      const userEndpoints = [
        { url: 'https://api.convoso.com/v1/users/recordings', method: 'GET' },
        { url: 'https://api.convoso.com/v1/users/recordings', method: 'POST' },
        { url: 'https://api.convoso.com/v1/user/recordings', method: 'GET' },
        { url: 'https://api.convoso.com/v1/user/recordings', method: 'POST' },
        { url: 'https://api.convoso.com/api/users/get-recordings', method: 'POST' },
        { url: 'https://api.convoso.com/api/users/recordings', method: 'POST' },
      ];

      for (const endpoint of userEndpoints) {
        const test: any = {
          endpoint: endpoint.url,
          method: endpoint.method,
          params: { auth_token: authToken, user: user_email }
        };

        try {
          let response;

          if (endpoint.method === 'GET') {
            const params = new URLSearchParams({
              auth_token: authToken,
              user: user_email,
              limit: '1'
            });
            response = await fetch(`${endpoint.url}?${params}`, {
              method: 'GET',
              headers: { 'Accept': 'application/json' }
            });
          } else {
            response = await fetch(endpoint.url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
              },
              body: JSON.stringify({
                auth_token: authToken,
                user: user_email,
                limit: 1
              })
            });
          }

          test.status = response.status;
          test.statusText = response.statusText;
          test.success = response.ok;

          if (response.ok) {
            try {
              const data = await response.json();
              test.response_sample = {
                is_array: Array.isArray(data),
                has_recordings: 'recordings' in data,
                has_data: 'data' in data,
                sample_keys: Object.keys(data).slice(0, 10)
              };
              test.working = true;
            } catch (e) {
              test.json_error = 'Failed to parse JSON';
            }
          } else {
            test.error = `${response.status} - ${response.statusText}`;
          }

        } catch (error: any) {
          test.network_error = error.message;
        }

        results.tests.push(test);

        if (test.working) {
          results.WORKING_USER_ENDPOINT = endpoint.url;
          break;
        }
      }
    }

    // Summary
    results.summary = {
      total_tests: results.tests.length,
      successful: results.tests.filter((t: any) => t.working).length,
      failed: results.tests.filter((t: any) => !t.success).length,
      found_working_endpoint: !!results.WORKING_ENDPOINT || !!results.WORKING_USER_ENDPOINT
    };

    return NextResponse.json({
      ok: true,
      message: 'Convoso API diagnostic completed',
      lead_id,
      user_email,
      results,
      recommendation: results.WORKING_ENDPOINT
        ? `Use endpoint: ${results.WORKING_ENDPOINT}`
        : 'No working endpoint found - check auth token and parameters'
    });

  } catch (error: any) {
    return NextResponse.json({
      ok: false,
      error: error.message
    }, { status: 500 });
  }
}

// GET endpoint for instructions
export async function GET(req: NextRequest) {
  return NextResponse.json({
    ok: true,
    message: 'Convoso API Diagnostic Tool',
    purpose: 'Tests multiple Convoso API endpoint variations to find the correct one',
    instructions: {
      endpoint: 'POST /api/test/convoso-diagnose',
      body: {
        lead_id: 'Optional - test lead-based endpoints',
        user_email: 'Optional - test user-based endpoints'
      },
      example: {
        lead_id: '12345'
      }
    },
    note: 'This will test various endpoint patterns and report which ones work'
  });
}