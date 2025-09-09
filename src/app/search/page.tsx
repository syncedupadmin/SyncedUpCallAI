'use client';
import { useState } from 'react';

export default function SearchPage(){
  const [q,setQ] = useState('bank declined payment');
  const [results,setResults] = useState<any[]>([]);
  async function go(){
    const r = await fetch('/api/ui/search', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ q }) });
    const j = await r.json(); setResults(j.results||[]);
  }
  return (
    <div>
      <h2 style={{fontSize:20, margin:'12px 0'}}>Semantic Search</h2>
      <div style={{display:'flex', gap:8}}>
        <input value={q} onChange={e=>setQ(e.target.value)} style={{flex:1, padding:8, color:'#111'}}/>
        <button onClick={go}>Search</button>
      </div>
      <ul style={{marginTop:16}}>
        {results.map((r:any)=>(
          <li key={r.id}>{new Date(r.started_at).toLocaleString()} • {r.agent} • {r.reason_primary} • score {r.score.toFixed(3)}</li>
        ))}
      </ul>
    </div>
  );
}
