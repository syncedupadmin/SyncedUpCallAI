import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logInfo, logError } from '@/lib/log';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const body = await req.json();

    const { auth_token, base_url } = body;

    if (!auth_token) {
      return NextResponse.json(
        { error: 'Auth token is required' },
        { status: 400 }
      );
    }

    // Don't test masked values
    if (auth_token === '••••••••') {
      return NextResponse.json(
        { error: 'Please enter actual credentials to test' },
        { status: 400 }
      );
    }

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const apiUrl = base_url || 'https://api.convoso.com/v1';

    logInfo({
      event_type: 'convoso_test_started',
      api_url: apiUrl,
      user_id: user?.id
    });

    try {
      // Test the connection with the leads/get-recordings endpoint (following existing pattern)
      // Using the same endpoint pattern as other Convoso integrations in codebase
      const params = new URLSearchParams({
        auth_token: auth_token,
        limit: '1'
      });

      const response = await fetch(`${apiUrl}/leads/get-recordings?${params}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const responseText = await response.text();

      if (response.ok) {
        logInfo({
          event_type: 'convoso_test_success',
          api_url: apiUrl,
          user_id: user?.id
        });
        return NextResponse.json({
          success: true,
          message: 'Connection successful'
        });
      } else {
        logError('Convoso test failed', new Error(`API returned ${response.status}`), {
          status: response.status,
          response_text: responseText,
          api_url: apiUrl,
          user_id: user?.id
        });

        // Parse error message if possible
        let errorMessage = `Connection failed (${response.status})`;
        try {
          const errorData = JSON.parse(responseText);
          if (errorData.message || errorData.error) {
            errorMessage = errorData.message || errorData.error;
          }
        } catch {
          // If not JSON, use status text
          errorMessage = response.status === 401
            ? 'Invalid credentials. Please check your API key and secret.'
            : `Connection failed: ${response.statusText}`;
        }

        return NextResponse.json(
          {
            success: false,
            error: errorMessage
          },
          { status: 400 }
        );
      }
    } catch (fetchError: any) {
      logError('Convoso test network error', fetchError, {
        api_url: apiUrl,
        user_id: user?.id,
        error_code: fetchError.code
      });

      // Handle network errors
      const errorMessage = fetchError.code === 'ENOTFOUND'
        ? 'Invalid API URL. Please check the base URL.'
        : fetchError.code === 'ETIMEDOUT'
        ? 'Connection timed out. Please check your network.'
        : 'Network error. Please check your connection and URL.';

      return NextResponse.json(
        {
          success: false,
          error: errorMessage
        },
        { status: 400 }
      );
    }

  } catch (error: any) {
    logError('Failed to test Convoso connection', error, {
      error_message: error.message
    });
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error'
      },
      { status: 500 }
    );
  }
}