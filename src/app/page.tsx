'use client';

import { useEffect, useState } from 'react';

type Health = {
  ok: boolean;
  now: string;
  env: Record<string, boolean>;
  meta: { vercelEnv: string | null; commitSha: string | null };
};

export default function Home() {
  const [health, setHealth] = useState<Health | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch('/api/health', { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setHealth(data);
      } catch (e: any) {
        setErr(e?.message || 'Failed to load health');
      }
    };
    run();
  }, []);

  return (
    <main style={{ padding: '2rem', fontFamily: 'Inter, ui-sans-serif, system-ui' }}>
      <h1>SyncedUp Call AI</h1>
      <p>Welcome! This project exposes API routes and a health check.</p>

      <section style={{ marginTop: '1rem' }}>
        <h2>Health</h2>
        {err && <pre style={{ color: 'crimson' }}>{err}</pre>}
        {!err && !health && <p>Loading…</p>}
        {health && (
          <div
            style={{
              border: '1px solid #333',
              borderRadius: 8,
              padding: '1rem',
              background: health.ok ? '#0b2' : '#b20',
              color: 'white',
            }}
          >
            <strong>{health.ok ? 'OK' : 'DOWN'}</strong>
            <div style={{ marginTop: 8, fontSize: 12 }}>
              <div>Server time: {health.now}</div>
              <div>Vercel env: {health.meta.vercelEnv || 'n/a'}</div>
              <div>Commit: {health.meta.commitSha?.slice(0, 7) || 'n/a'}</div>
            </div>
          </div>
        )}
      </section>

      <section style={{ marginTop: '1.25rem' }}>
        <h2>API Endpoints</h2>
        <ul>
          <li><a href="/api/health">/api/health</a></li>
          <li><code>/api/hooks/convoso</code> (POST, requires headers)</li>
          <li><code>/api/jobs/analyze</code> (POST, requires <code>Authorization: Bearer {`<JOBS_SECRET>`}</code>)</li>
        </ul>
      </section>

      <footer style={{ marginTop: '2rem', opacity: 0.7, fontSize: 12 }}>
        Tip: if this page shows 404 again, the app likely didn't include <code>src/app/page.tsx</code> in the build.
      </footer>
    </main>
  );
}