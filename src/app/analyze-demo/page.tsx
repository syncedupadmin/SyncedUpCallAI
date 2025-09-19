"use client";
import { useState } from "react";
import CallAnalysisCard, { Analysis } from "@/components/CallAnalysisCard";

export default function AnalyzeDemo() {
  const [url, setUrl] = useState("");
  const [data, setData] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setLoading(true); setErr(null); setData(null);
    try {
      const r = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          recording_url: url,
          meta: { agent_id: "Unknown", campaign: "N/A", duration_sec: 0, disposition: "Unknown", direction: "outbound" }
        })
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed");
      setData(j);
    } catch (e:any) {
      setErr(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Analyze Call (demo)</h1>
      <div className="rounded-xl border p-4 space-y-3">
        <input className="w-full rounded border p-2" placeholder="Paste MP3 URL from Convoso" value={url} onChange={e => setUrl(e.target.value)} />
        <button className="rounded bg-black px-4 py-2 text-white disabled:opacity-50" onClick={run} disabled={!url || loading}>
          {loading ? "Analyzing…" : "Analyze"}
        </button>
        {err && <div className="text-red-600 text-sm">{err}</div>}
      </div>
      {data && <CallAnalysisCard data={data} />}
    </div>
  );
}