'use client';
import useSWR from 'swr';

export default function ValueReport(){
  const { data } = useSWR('/api/reports/value', u=>fetch(u).then(r=>r.json()));
  const rows = data?.rows || [];
  return (
    <div>
      <h2 style={{fontSize:20, margin:'12px 0'}}>Revenue-weighted Cancel Report (stub ≥ $300)</h2>
      <table style={{width:'100%', fontSize:14, borderCollapse:'collapse'}}>
        <thead><tr><th>Reason</th><th>Calls</th><th>Lost Value</th></tr></thead>
        <tbody>
          {rows.map((r:any)=>(
            <tr key={r.reason_primary} style={{borderTop:'1px solid #1f2a37'}}>
              <td>{r.reason_primary}</td>
              <td>{r.calls}</td>
              <td>${Number(r.lost_value||0).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
