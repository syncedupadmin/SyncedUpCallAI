export type Segment = {
  speaker: "agent" | "customer";
  startMs: number;
  endMs: number;
  text: string;
  conf: number;
};

export type TalkMetrics = {
  talk_time_agent_sec: number;
  talk_time_customer_sec: number;
  silence_time_sec: number;
  interrupt_count: number;
};

const MERGE_GAP_MS = 120;   // bridge tiny ASR gaps when coalescing
const MIN_OVERLAP_MS = 150; // ignore micro-overlaps
const MIN_INTERRUPT_MS = 300;

function coalesceIntervals(list: Array<[number, number]>): Array<[number, number]> {
  if (list.length === 0) return [];
  const ivs = [...list].sort((a, b) => a[0] - b[0]);
  const out: Array<[number, number]> = [];
  let [cs, ce] = ivs[0];
  for (let i = 1; i < ivs.length; i++) {
    const [s, e] = ivs[i];
    if (s <= ce + MERGE_GAP_MS) {
      ce = Math.max(ce, e);
    } else {
      out.push([cs, ce]);
      [cs, ce] = [s, e];
    }
  }
  out.push([cs, ce]);
  return out;
}

function sumIntervals(ivs: Array<[number, number]>): number {
  return ivs.reduce((acc, [s, e]) => acc + Math.max(0, e - s), 0);
}

export function computeTalkMetrics(segments: Segment[]): TalkMetrics {
  if (!Array.isArray(segments) || segments.length === 0) {
    return { talk_time_agent_sec: 0, talk_time_customer_sec: 0, silence_time_sec: 0, interrupt_count: 0 };
  }

  const segs = segments
    .filter(s => Number.isFinite(s.startMs) && Number.isFinite(s.endMs) && s.endMs > s.startMs)
    .map(s => ({ ...s }))
    .sort((a, b) => a.startMs - b.startMs);

  if (segs.length === 0) {
    return { talk_time_agent_sec: 0, talk_time_customer_sec: 0, silence_time_sec: 0, interrupt_count: 0 };
  }

  // collect intervals per speaker
  const agentIvs: Array<[number, number]> = [];
  const custIvs: Array<[number, number]> = [];
  for (const s of segs) {
    (s.speaker === "agent" ? agentIvs : custIvs).push([s.startMs, s.endMs]);
  }

  const agentMerged = coalesceIntervals(agentIvs);
  const custMerged = coalesceIntervals(custIvs);

  // union of both speakers for speech coverage
  const speechUnion = coalesceIntervals([...agentMerged, ...custMerged]);

  const callStart = Math.min(...segs.map(s => s.startMs));
  const callEnd = Math.max(...segs.map(s => s.endMs));
  const callSpan = Math.max(0, callEnd - callStart);

  const agentMs = sumIntervals(agentMerged);
  const custMs = sumIntervals(custMerged);
  const speechMs = sumIntervals(speechUnion);
  const silenceMs = Math.max(0, callSpan - speechMs);

  // interrupts: a segment starts while the other speaker is already in an active interval
  const startsInside = (t: number, ivs: Array<[number, number]>) =>
    ivs.find(([s, e]) => t >= s && t < e);

  let interruptCount = 0;
  for (const s of segs) {
    const dur = s.endMs - s.startMs;
    if (dur < MIN_INTERRUPT_MS) continue; // too short to count as a real interruption
    if (s.speaker === "agent") {
      const overlap = startsInside(s.startMs, custMerged);
      if (overlap && Math.min(s.endMs, overlap[1]) - s.startMs >= MIN_OVERLAP_MS) interruptCount++;
    } else {
      const overlap = startsInside(s.startMs, agentMerged);
      if (overlap && Math.min(s.endMs, overlap[1]) - s.startMs >= MIN_OVERLAP_MS) interruptCount++;
    }
  }

  return {
    talk_time_agent_sec: Math.round(agentMs / 1000),
    talk_time_customer_sec: Math.round(custMs / 1000),
    silence_time_sec: Math.round(silenceMs / 1000),
    interrupt_count: interruptCount
  };
}