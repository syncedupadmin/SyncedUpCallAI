'use client';
import { useState } from 'react';
import useSWR from 'swr';
import Pagination from '@/src/components/Pagination';

export default function CallsPage() {
  const [offset, setOffset] = useState(0);
  const limit = 20;
  
  const { data, isLoading } = useSWR(
    `/api/ui/calls?limit=${limit}&offset=${offset}`, 
    u => fetch(u).then(r=>r.json())
  );
  
  const rows = data?.data || [];
  const total = data?.total || 0;
  
  return (
    <div>
      <h2 style={{fontSize:20, margin:'12px 0'}}>Recent Calls (&gt;=10s)</h2>
      
      {isLoading && offset === 0 ? (
        <p>Loading calls...</p>
      ) : (
        <>
          <table style={{width:'100%', fontSize:14, borderCollapse:'collapse'}}>
            <thead>
              <tr>
                <th>Time</th>
                <th>Agent</th>
                <th>Phone</th>
                <th>Disposition</th>
                <th>Reason</th>
                <th>Dur</th>
                <th>Summary</th>
                <th>Recording</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r:any)=> (
                <tr key={r.id} style={{borderTop:'1px solid #1f2a37'}}>
                  <td>{r.started_at ? new Date(r.started_at).toLocaleString() : '—'}</td>
                  <td>{r.agent||'—'}</td>
                  <td>{r.primary_phone||'—'}</td>
                  <td>{r.disposition||'—'}</td>
                  <td>{r.reason_primary||'—'}</td>
                  <td>{r.duration_sec||0}s</td>
                  <td>{r.summary||'—'}</td>
                  <td>{r.recording_url ? <a href={r.recording_url} target="_blank">Play</a> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          
          <Pagination
            total={total}
            limit={limit}
            offset={offset}
            onPageChange={setOffset}
            loading={isLoading}
          />
        </>
      )}
    </div>
  );
}
