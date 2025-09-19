'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function TestAdminPage() {
  const [status, setStatus] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [setupResult, setSetupResult] = useState<any>(null);

  const supabase = createClient();

  useEffect(() => {
    checkStatus();
  }, []);

  const checkStatus = async () => {
    setLoading(true);
    try {
      // Check auth status
      const { data: { user } } = await supabase.auth.getUser();

      // Check admin status via RPC
      const { data: isAdmin, error: adminError } = await supabase.rpc('is_admin');

      // Check admin status via API
      const apiRes = await fetch('/api/auth/admin-setup');
      const apiData = await apiRes.json();

      setStatus({
        user,
        isAdmin,
        adminError,
        apiStatus: apiData
      });
    } catch (error) {
      console.error('Error checking status:', error);
      setStatus({ error });
    } finally {
      setLoading(false);
    }
  };

  const setupAdmin = async () => {
    const secret = prompt('Enter ADMIN_SECRET from .env.local:');
    if (!secret) return;

    setLoading(true);
    try {
      const res = await fetch('/api/auth/admin-setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'admin@syncedupsolutions.com',
          secret
        })
      });

      const data = await res.json();
      setSetupResult(data);

      if (data.ok) {
        alert('Admin setup successful! Try accessing /admin/super now.');
        await checkStatus(); // Refresh status
      } else {
        alert(`Setup failed: ${data.error}`);
      }
    } catch (error) {
      console.error('Setup error:', error);
      alert('Setup failed - check console');
    } finally {
      setLoading(false);
    }
  };

  const navigateToAdmin = () => {
    window.location.href = '/admin/super';
  };

  return (
    <div style={{ padding: '40px', maxWidth: '800px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '24px', marginBottom: '20px' }}>Admin Access Test Page</h1>

      {loading ? (
        <p>Loading...</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Current Status */}
          <div style={{
            padding: '20px',
            background: '#f0f0f0',
            borderRadius: '8px',
            color: '#000'
          }}>
            <h2 style={{ fontSize: '18px', marginBottom: '10px' }}>Current Status:</h2>
            <pre style={{ fontSize: '12px', overflow: 'auto' }}>
              {JSON.stringify(status, null, 2)}
            </pre>
          </div>

          {/* Setup Result */}
          {setupResult && (
            <div style={{
              padding: '20px',
              background: setupResult.ok ? '#d4f4dd' : '#f4d4d4',
              borderRadius: '8px',
              color: '#000'
            }}>
              <h2 style={{ fontSize: '18px', marginBottom: '10px' }}>Setup Result:</h2>
              <pre style={{ fontSize: '12px', overflow: 'auto' }}>
                {JSON.stringify(setupResult, null, 2)}
              </pre>
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={checkStatus}
              style={{
                padding: '10px 20px',
                background: '#4A90E2',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Refresh Status
            </button>

            <button
              onClick={setupAdmin}
              style={{
                padding: '10px 20px',
                background: '#E94B3C',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Setup Admin Access
            </button>

            <button
              onClick={navigateToAdmin}
              style={{
                padding: '10px 20px',
                background: '#2ECC40',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Go to /admin/super
            </button>
          </div>

          {/* Instructions */}
          <div style={{
            padding: '20px',
            background: '#fff3cd',
            borderRadius: '8px',
            color: '#856404'
          }}>
            <h2 style={{ fontSize: '18px', marginBottom: '10px' }}>Instructions:</h2>
            <ol>
              <li>Make sure you're logged in as admin@syncedupsolutions.com</li>
              <li>Click "Setup Admin Access" and enter: <code>change-this-secret-in-production</code></li>
              <li>Once setup is successful, click "Go to /admin/super"</li>
              <li>The admin dashboard should now be accessible</li>
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}