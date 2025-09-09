'use client';
import useSWR from 'swr';

export default function LibraryPage(){
  const { data } = useSWR('/api/ui/library', u=>fetch(u).then(r=>r.json()));
  return (
    <div>
      <h2 style={{fontSize:20, margin:'12px 0'}}>Call Library</h2>
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:16}}>
        <section>
          <h3>Best</h3>
          <ul>{data?.best?.map((r:any)=>(
            <li key={r.id}>{new Date(r.started_at).toLocaleString()} • {r.agent} • QA {r.qa_score} • {r.reason_primary} • {r.summary}</li>
          ))}</ul>
        </section>
        <section>
          <h3>Worst</h3>
          <ul>{data?.worst?.map((r:any)=>(
            <li key={r.id}>{new Date(r.started_at).toLocaleString()} • {r.agent} • QA {r.qa_score} • {r.reason_primary} • {r.summary}</li>
          ))}</ul>
        </section>
      </div>
    </div>
  );
}
