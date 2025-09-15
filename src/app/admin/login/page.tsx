'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, AlertCircle } from 'lucide-react';

export default function AdminLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();

      if (res.ok && data.ok) {
        // Redirect to super admin portal
        router.push('/admin/super');
      } else {
        setError(data.error || 'Invalid credentials');
      }
    } catch (err) {
      setError('Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #0a0a0f 0%, #1a1a1f 100%)'
    }}>
      <div className="glass-card" style={{
        width: '100%',
        maxWidth: 400,
        padding: 40,
        margin: 20
      }}>
        <div style={{
          textAlign: 'center',
          marginBottom: 32
        }}>
          <div style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #ff6b6b 0%, #ff8e53 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px'
          }}>
            <Lock size={28} color="#ffffff" />
          </div>
          <h1 style={{
            fontSize: 24,
            fontWeight: 700,
            marginBottom: 8
          }}>
            Admin Access Required
          </h1>
          <p style={{
            color: '#6b6b7c',
            fontSize: 14
          }}>
            Enter your admin credentials to continue
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 20 }}>
            <label style={{
              display: 'block',
              fontSize: 12,
              color: '#a8a8b3',
              marginBottom: 8,
              textTransform: 'uppercase',
              letterSpacing: 0.5
            }}>
              Admin Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your admin email"
              required
              autoFocus
              style={{
                width: '100%',
                padding: '12px 16px',
                background: 'rgba(10, 10, 15, 0.6)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: 8,
                color: '#ffffff',
                fontSize: 14,
                outline: 'none',
                transition: 'all 0.2s'
              }}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{
              display: 'block',
              fontSize: 12,
              color: '#a8a8b3',
              marginBottom: 8,
              textTransform: 'uppercase',
              letterSpacing: 0.5
            }}>
              Admin Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              style={{
                width: '100%',
                padding: '12px 16px',
                background: 'rgba(10, 10, 15, 0.6)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: 8,
                color: '#ffffff',
                fontSize: 14,
                outline: 'none',
                transition: 'all 0.2s'
              }}
            />
          </div>

          {error && (
            <div style={{
              padding: 12,
              marginBottom: 20,
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}>
              <AlertCircle size={16} color="#ef4444" />
              <span style={{ fontSize: 13, color: '#ef4444' }}>
                {error}
              </span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !email || !password}
            className="btn btn-primary"
            style={{
              width: '100%',
              padding: '12px 24px',
              background: loading
                ? 'rgba(124, 58, 237, 0.5)'
                : 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
              border: 'none',
              borderRadius: 8,
              color: '#ffffff',
              fontSize: 14,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s'
            }}
          >
            {loading ? 'Authenticating...' : 'Access Admin Portal'}
          </button>
        </form>

        <div style={{
          marginTop: 32,
          padding: 16,
          background: 'rgba(124, 58, 237, 0.05)',
          border: '1px solid rgba(124, 58, 237, 0.2)',
          borderRadius: 8
        }}>
          <p style={{
            fontSize: 12,
            color: '#a8a8b3',
            lineHeight: 1.5
          }}>
            <strong style={{ color: '#7c3aed' }}>Security Notice:</strong> This area contains sensitive
            administrative functions. Access is logged and monitored. Unauthorized access attempts
            will be reported.
          </p>
        </div>
      </div>

      <style jsx>{`
        input:focus {
          border-color: rgba(124, 58, 237, 0.5) !important;
          box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.1);
        }

        button:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 8px 20px rgba(124, 58, 237, 0.3);
        }
      `}</style>
    </div>
  );
}