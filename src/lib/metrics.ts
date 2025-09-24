// src/lib/metrics.ts
import type { Segment } from "./asr-nova2";

const norm = (s:string) => s.toLowerCase();

export function computeTalkMetrics(segments: Segment[]) {
  let a = 0, c = 0, sil = 0, intr = 0;
  let questionsFirstMinute = 0;

  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    const dur = (s.endMs - s.startMs) / 1000;
    if (s.speaker === "agent") a += dur; else c += dur;

    // gaps
    if (i > 0) {
      const gap = (s.startMs - segments[i - 1].endMs) / 1000;
      if (gap > 0.15) sil += gap;
      if (segments[i - 1].speaker === "customer" && s.speaker === "agent" && gap < 0.2) intr++;
    }

    // discovery proxy: "?" or interrogatives in first 60s
    if (s.speaker === "agent" && s.startMs <= 60_000) {
      const t = norm(s.text);
      if (t.includes("?") || /\b(why|how|when|what|which|where|do you|are you|can you)\b/.test(t)) {
        questionsFirstMinute++;
      }
    }
  }

  const totalTalk = a + c;
  const talkRatioAgent = totalTalk > 0 ? a / totalTalk : 0;

  return {
    talk_time_agent_sec: Math.round(a),
    talk_time_customer_sec: Math.round(c),
    silence_time_sec: Math.round(sil),
    interrupt_count: intr,
    questions_first_minute: questionsFirstMinute,
    talk_ratio_agent: Number(talkRatioAgent.toFixed(2))
  };
}

/**
 * Enhanced hold detection with system events and silence detection:
 * - System holds: When Convoso/system provides HOLD/UNHOLD events
 * - Explicit holds: Agent says "hold" then silence >= 10s
 * - Dead air: Any silence gap >= 20s without hold cue
 */
export function computeHoldStats(segments: Segment[], systemEvents?: Array<{type: string; timestamp: number}>) {
  const holds: Array<{
    startMs: number;
    endMs: number;
    type: "system_hold" | "explicit_hold" | "silence_hold";
    reason?: string;
  }> = [];

  // Process system events if available (Convoso HOLD/UNHOLD)
  if (systemEvents && systemEvents.length > 0) {
    let holdStart: number | null = null;

    for (const event of systemEvents) {
      if (event.type === "HOLD" && holdStart === null) {
        holdStart = event.timestamp;
      } else if (event.type === "UNHOLD" && holdStart !== null) {
        holds.push({
          startMs: holdStart,
          endMs: event.timestamp,
          type: "system_hold",
          reason: "System HOLD event"
        });
        holdStart = null;
      }
    }
  }

  // Fallback to silence-based detection
  for (let i = 1; i < segments.length; i++) {
    const prev = segments[i-1];
    const cur = segments[i];
    const gap = cur.startMs - prev.endMs;

    // Check if this gap overlaps with a system hold
    const overlapsSysHold = holds.some(h =>
      h.type === "system_hold" &&
      prev.endMs >= h.startMs && cur.startMs <= h.endMs
    );

    if (overlapsSysHold) continue; // Skip if already covered by system hold

    // Agent explicitly says hold before gap
    const agentHoldCue = prev.speaker === "agent" &&
      /\b(hold on|one moment|let me put you on hold|un momento|bear with me|just a sec|give me a moment)\b/i.test(prev.text);

    if (agentHoldCue && gap >= 10_000) {
      holds.push({
        startMs: prev.endMs,
        endMs: cur.startMs,
        type: "explicit_hold",
        reason: "Agent announced hold"
      });
    } else if (gap >= 20_000) {
      holds.push({
        startMs: prev.endMs,
        endMs: cur.startMs,
        type: "silence_hold",
        reason: "Dead air detected"
      });
    }
  }

  // Calculate totals by type
  const holdsByType = {
    system: holds.filter(h => h.type === "system_hold"),
    explicit: holds.filter(h => h.type === "explicit_hold"),
    silence: holds.filter(h => h.type === "silence_hold")
  };

  const totalHoldSec = Math.round(holds.reduce((s,h) => s + (h.endMs - h.startMs)/1000, 0));
  const systemHoldSec = Math.round(holdsByType.system.reduce((s,h) => s + (h.endMs - h.startMs)/1000, 0));
  const explicitHoldSec = Math.round(holdsByType.explicit.reduce((s,h) => s + (h.endMs - h.startMs)/1000, 0));
  const silenceHoldSec = Math.round(holdsByType.silence.reduce((s,h) => s + (h.endMs - h.startMs)/1000, 0));

  return {
    holds,
    hold_time_sec: totalHoldSec,
    hold_events: holds.length,
    hold_breakdown: {
      system_holds: holdsByType.system.length,
      explicit_holds: holdsByType.explicit.length,
      silence_holds: holdsByType.silence.length,
      system_hold_sec: systemHoldSec,
      explicit_hold_sec: explicitHoldSec,
      silence_hold_sec: silenceHoldSec
    }
  };
}

/** Wasted call = customer answers but agent provides ~no content and bails.
 * Heuristic:
 * - talk_time_agent_sec < 5s OR (duration < 20s and no questions asked)
 */
export function isWastedCall(talk: ReturnType<typeof computeTalkMetrics>, segments: Segment[]) {
  const durationSec = segments.length ? Math.round((segments[segments.length-1].endMs - segments[0].startMs)/1000) : 0;
  const noQuestions = talk.questions_first_minute === 0;
  return (talk.talk_time_agent_sec < 5) || (durationSec < 20 && noQuestions);
}

// DISABLED: We never send voicemail recordings for analysis
// export function isVoicemailLike(segments: Segment[]): boolean {
//   // Simple heuristic: if it's all agent talking with no customer response
//   const agentOnly = segments.every(s => s.speaker === "agent");
//   const hasVoicemailKeywords = segments.some(s =>
//     /voicemail|leave a message|call you back|not available/i.test(s.text)
//   );
//   return agentOnly || hasVoicemailKeywords;
// }