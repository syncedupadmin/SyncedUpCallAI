'use client';

import { useEffect, useState } from 'react';
import CallsTable from './parts/CallsTable';

export default function DashboardPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/ui/calls?limit=50')
      .then(res => res.json())
      .then(data => {
        setRows(data.rows || []);
        setLoading(false);
      })
      .catch(() => {
        setRows([]);
        setLoading(false);
      });
  }, []);

  return (
    <main style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <h1>Dashboard</h1>
      <p style={{ opacity: 0.8, marginBottom: 16 }}>
        View recent calls, trigger transcription/analysis, and drill into details.
      </p>
      {loading ? <p>Loading calls...</p> : <CallsTable rows={rows} />}
    </main>
  );
}