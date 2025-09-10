'use client';

import { useEffect, useState } from 'react';

export default function Home() {
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/health')
      .then(res => res.json())
      .then(data => {
        setHealth(data);
        setLoading(false);
      })
      .catch(() => {
        setHealth({ ok: false });
        setLoading(false);
      });
  }, []);
  return (
    <main style={{ padding: 24, maxWidth: 980, margin: '0 auto' }}>
      <h1>SyncedUpCallAI – Health</h1>
      {loading ? (
        <p>Loading...</p>
      ) : (
        <>
          <pre style={{ background: '#111', padding: 16, borderRadius: 8, overflow: 'auto', color: '#fff' }}>
            {JSON.stringify(health, null, 2)}
          </pre>
          <p style={{ marginTop: 16 }}>
            <a href="/dashboard" style={{ color: '#0070f3', textDecoration: 'underline' }}>Go to Dashboard →</a>
          </p>
        </>
      )}
    </main>
  );
}