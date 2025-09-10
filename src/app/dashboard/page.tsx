import CallsTable from './parts/CallsTable';

export const dynamic = 'force-dynamic';

async function getCalls() {
  const res = await fetch(`${process.env.APP_URL}/api/ui/calls?limit=50`, { cache: 'no-store' });
  if (!res.ok) return { ok: false, rows: [] as any[] };
  return res.json();
}

export default async function DashboardPage() {
  const { rows } = await getCalls();

  return (
    <main style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <h1>Dashboard</h1>
      <p style={{ opacity: 0.8, marginBottom: 16 }}>
        View recent calls, trigger transcription/analysis, and drill into details.
      </p>
      <CallsTable rows={rows ?? []} />
    </main>
  );
}