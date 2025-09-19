// src/lib/metrics.ts
import type { Segment } from "./asr-nova2";

export function computeTalkMetrics(segments: Segment[]) {
  let a = 0, c = 0, sil = 0, intr = 0;
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    const dur = (s.endMs - s.startMs) / 1000;
    if (s.speaker === "agent") a += dur; else c += dur;
    if (i > 0) {
      const gap = (s.startMs - segments[i - 1].endMs) / 1000;
      if (gap > 0.15) sil += gap;
      if (segments[i - 1].speaker === "customer" && s.speaker === "agent" && gap < 0.2) intr++;
    }
  }
  return {
    talk_time_agent_sec: Math.round(a),
    talk_time_customer_sec: Math.round(c),
    silence_time_sec: Math.round(sil),
    interrupt_count: intr
  };
}

export function isVoicemailLike(segments: Segment[]) {
  const totalSec = segments.length
    ? (segments[segments.length - 1].endMs - segments[0].startMs) / 1000
    : 0;
  const joined = segments.map(s => s.text.toLowerCase()).join(" ");
  return totalSec < 25 || /leave a message|tone|voicemail/i.test(joined);
}