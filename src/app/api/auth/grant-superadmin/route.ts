import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  try {
    // Check for required environment variables
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    // Admin client with service role for updating auth.users
    const adminClient = createClient(
      supabaseUrl,
      supabaseServiceKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Create client with cookies for auth
    const cookieStore = cookies();
    const supabase = createServerClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
        },
      }
    );

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    console.log(`[Grant Superadmin] Processing request for user: ${user.email}`);

    // Update auth.users to grant super admin
    const { error: updateAuthError } = await adminClient.auth.admin.updateUserById(
      user.id,
      {
        user_metadata: {
          role: 'super_admin',
          is_super_admin: true
        },
        app_metadata: {
          role: 'super_admin',
          is_super_admin: true
        }
      }
    );

    if (updateAuthError) {
      console.error('[Grant Superadmin] Error updating auth.users:', updateAuthError);
    }

    // Update profiles table
    const { error: profileError } = await adminClient
      .from('profiles')
      .upsert({
        id: user.id,
        email: user.email,
        role: 'super_admin',
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'id'
      });

    if (profileError) {
      console.error('[Grant Superadmin] Error updating profiles:', profileError);
    }

    // Update user_profiles table
    const { error: userProfileError } = await adminClient
      .from('user_profiles')
      .upsert({
        id: user.id,
        email: user.email,
        level: 5, // Highest level
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'id'
      });

    if (userProfileError) {
      console.error('[Grant Superadmin] Error updating user_profiles:', userProfileError);
    }

    // Add to admin_users table
    const { error: adminUserError } = await adminClient
      .from('admin_users')
      .upsert({
        id: user.id,
        email: user.email,
        admin_level: 'super_admin',
        created_at: new Date().toISOString()
      }, {
        onConflict: 'id'
      });

    if (adminUserError) {
      console.error('[Grant Superadmin] Error updating admin_users:', adminUserError);
    }

    // Force refresh the session to get new metadata
    const { data: { session }, error: refreshError } = await supabase.auth.refreshSession();

    if (refreshError) {
      console.error('[Grant Superadmin] Error refreshing session:', refreshError);
    }

    console.log(`[Grant Superadmin] Successfully granted superadmin to: ${user.email}`);

    return NextResponse.json({
      success: true,
      message: `Superadmin access granted to ${user.email}`,
      user: {
        id: user.id,
        email: user.email,
        role: 'super_admin'
      }
    });

  } catch (error: any) {
    console.error('[Grant Superadmin] Error:', error);
    return NextResponse.json(
      { error: 'Failed to grant superadmin access', details: error.message },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  // Simple page to grant yourself superadmin
  return new NextResponse(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Grant Superadmin Access</title>
      <style>
        body {
          font-family: system-ui;
          max-width: 600px;
          margin: 100px auto;
          padding: 20px;
          background: #f5f5f5;
        }
        .container {
          background: white;
          padding: 30px;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        h1 { color: #333; }
        button {
          background: #4F46E5;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 6px;
          font-size: 16px;
          cursor: pointer;
          margin-top: 20px;
        }
        button:hover { background: #4338CA; }
        button:disabled {
          background: #ccc;
          cursor: not-allowed;
        }
        .success {
          color: green;
          margin-top: 20px;
          padding: 15px;
          background: #f0fdf4;
          border: 1px solid #86efac;
          border-radius: 6px;
        }
        .error {
          color: red;
          margin-top: 20px;
          padding: 15px;
          background: #fef2f2;
          border: 1px solid #fca5a5;
          border-radius: 6px;
        }
        .info {
          background: #eff6ff;
          border: 1px solid #93c5fd;
          padding: 15px;
          border-radius: 6px;
          margin-bottom: 20px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Grant Superadmin Access</h1>
        <div class="info">
          <p><strong>Current User:</strong> <span id="userEmail">Checking...</span></p>
          <p>Click the button below to grant yourself superadmin privileges.</p>
        </div>
        <button id="grantBtn" onclick="grantAccess()">Grant Superadmin Access</button>
        <div id="result"></div>
      </div>
      <script>
        // Check current user
        fetch('/api/auth/admin')
          .then(r => r.json())
          .then(data => {
            document.getElementById('userEmail').textContent = data.user?.email || 'Not logged in';
            if (!data.user) {
              document.getElementById('grantBtn').disabled = true;
              document.getElementById('result').innerHTML = '<div class="error">Please log in first</div>';
            }
          });

        async function grantAccess() {
          const btn = document.getElementById('grantBtn');
          const result = document.getElementById('result');

          btn.disabled = true;
          btn.textContent = 'Processing...';
          result.innerHTML = '';

          try {
            const response = await fetch('/api/auth/grant-superadmin', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' }
            });

            const data = await response.json();

            if (response.ok) {
              result.innerHTML = '<div class="success">✓ ' + data.message + '<br><br>Please refresh the page or log out and back in for changes to take effect.</div>';
              btn.textContent = 'Access Granted!';
            } else {
              result.innerHTML = '<div class="error">✗ ' + (data.error || 'Failed to grant access') + '</div>';
              btn.disabled = false;
              btn.textContent = 'Try Again';
            }
          } catch (error) {
            result.innerHTML = '<div class="error">✗ Network error: ' + error.message + '</div>';
            btn.disabled = false;
            btn.textContent = 'Try Again';
          }
        }
      </script>
    </body>
    </html>
  `, {
    headers: { 'Content-Type': 'text/html' }
  });
}