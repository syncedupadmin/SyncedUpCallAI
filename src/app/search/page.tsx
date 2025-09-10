'use client';
import { useState } from 'react';
import Pagination from '@/src/components/Pagination';

export default function SearchPage(){
  const [q,setQ] = useState('bank declined payment');
  const [results,setResults] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const limit = 20;
  
  async function go(newOffset = 0){
    setLoading(true);
    const r = await fetch('/api/ui/search', { 
      method:'POST', 
      headers:{'Content-Type':'application/json'}, 
      body: JSON.stringify({ q, limit, offset: newOffset }) 
    });
    const j = await r.json(); 
    setResults(j.data||[]);
    setTotal(j.total || 0);
    setOffset(newOffset);
    setLoading(false);
  }
  
  const handlePageChange = (newOffset: number) => {
    go(newOffset);
  };
  
  const handleSearch = () => {
    setOffset(0);
    go(0);
  };
  
  return (
    <div>
      <h2 style={{fontSize:20, margin:'12px 0'}}>Semantic Search</h2>
      <div style={{display:'flex', gap:8}}>
        <input 
          value={q} 
          onChange={e=>setQ(e.target.value)} 
          onKeyPress={e => e.key === 'Enter' && handleSearch()}
          style={{flex:1, padding:8, color:'#111'}}
        />
        <button onClick={handleSearch} disabled={loading}>
          {loading ? 'Searching...' : 'Search'}
        </button>
      </div>
      
      {results.length > 0 && (
        <>
          <ul style={{marginTop:16}}>
            {results.map((r:any)=>(
              <li key={r.id}>
                {new Date(r.started_at).toLocaleString()} • {r.agent} • {r.reason_primary} • score {r.score.toFixed(3)}
              </li>
            ))}
          </ul>
          
          <Pagination
            total={total}
            limit={limit}
            offset={offset}
            onPageChange={handlePageChange}
            loading={loading}
          />
        </>
      )}
    </div>
  );
}
