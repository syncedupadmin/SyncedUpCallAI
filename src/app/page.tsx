export const dynamic = 'force-dynamic';

async function getHealth() {
  const res = await fetch(`${process.env.APP_URL}/api/health`, { cache: 'no-store' });
  if (!res.ok) return { ok: false };
  return res.json();
}

export default async function Home() {
  const health = await getHealth();
  return (
    <main style={{ padding: 24, maxWidth: 980, margin: '0 auto' }}>
      <h1>SyncedUpCallAI – Health</h1>
      <pre style={{ background: '#111', padding: 16, borderRadius: 8, overflow: 'auto', color: '#fff' }}>
        {JSON.stringify(health, null, 2)}
      </pre>
      <p style={{ marginTop: 16 }}>
        <a href="/dashboard" style={{ color: '#0070f3', textDecoration: 'underline' }}>Go to Dashboard →</a>
      </p>
    </main>
  );
}