export const dynamic = 'force-dynamic';

async function getData(id: string) {
  const res = await fetch(`${process.env.APP_URL}/api/ui/call/${id}`, { cache: 'no-store' });
  if (!res.ok) return { ok: false };
  return res.json();
}

export default async function CallDetail({ params }: { params: { id: string } }) {
  const data = await getData(params.id);

  if (!data?.ok) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Call not found</h1>
        <p><a href="/dashboard" style={{ color: '#0070f3' }}>← Back to dashboard</a></p>
      </main>
    );
  }

  const { call, transcript, analysis, events } = data;

  return (
    <main style={{ padding: 24, maxWidth: 1000, margin: '0 auto' }}>
      <p><a href="/dashboard" style={{ color: '#0070f3' }}>← Back</a></p>
      <h1>Call {call.id}</h1>

      <section style={{ marginTop: 16 }}>
        <h3>Metadata</h3>
        <pre style={{ background: '#111', padding: 12, borderRadius: 8, color: '#fff', overflow: 'auto' }}>
          {JSON.stringify(call, null, 2)}
        </pre>
      </section>

      <section style={{ marginTop: 16 }}>
        <h3>Transcript</h3>
        {transcript?.text ? (
          <pre style={{ whiteSpace: 'pre-wrap', background: '#111', padding: 12, borderRadius: 8, color: '#fff' }}>
            {transcript.text}
          </pre>
        ) : (
          <p style={{ opacity: 0.7 }}>No transcript yet.</p>
        )}
      </section>

      <section style={{ marginTop: 16 }}>
        <h3>Analysis</h3>
        {analysis ? (
          <pre style={{ background: '#111', padding: 12, borderRadius: 8, color: '#fff', overflow: 'auto' }}>
            {JSON.stringify(analysis, null, 2)}
          </pre>
        ) : (
          <p style={{ opacity: 0.7 }}>No analysis yet.</p>
        )}
      </section>

      <section style={{ marginTop: 16 }}>
        <h3>Events</h3>
        {events?.length ? (
          <pre style={{ background: '#111', padding: 12, borderRadius: 8, color: '#fff', overflow: 'auto' }}>
            {JSON.stringify(events, null, 2)}
          </pre>
        ) : (
          <p style={{ opacity: 0.7 }}>No events.</p>
        )}
      </section>
    </main>
  );
}