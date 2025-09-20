// src/lib/name-merge.ts
import { extractCustomerName, type Seg as NameSeg } from "@/lib/name-extract";

export type ConvosoMeta = {
  customer_first_name?: string | null;
  customer_last_name?: string | null;
  customer_full_name?: string | null;
  agent_name?: string | null;
};

export type NameChoice = {
  first_name: string | null;
  last_name: string | null;
  confidence: number;            // 0..1
  source: "convoso_meta" | "audio_extract" | "llm_backstop";
  evidence_ts: string | null;
  evidence_quote: string | null;
  alternate?: {
    first_name: string | null;
    last_name: string | null;
    confidence: number;
    source: "audio_extract" | "convoso_meta" | "llm_backstop";
    evidence_ts: string | null;
    evidence_quote: string | null;
  } | null;
};

// sanitize and split helpers
const clean = (s?: string | null) =>
  (s ?? "").replace(/\s+/g, " ").trim();

function splitFullName(full: string) {
  const parts = clean(full).split(" ").filter(Boolean);
  if (parts.length === 0) return { first: null, last: null };
  if (parts.length === 1) return { first: cap(parts[0]), last: null };
  return { first: cap(parts[0]), last: cap(parts.slice(1).join(" ")) };
}

const cap = (s: string) => s.replace(/\b\w/g, m => m.toUpperCase());

function valid(s?: string | null) {
  if (!s) return false;
  if (s.length < 2) return false;
  if (/[0-9@#$%]/.test(s)) return false;
  return true;
}

/**
 * Decide name source in priority:
 * 1) Convoso meta if present and looks valid (confidence 1.0)
 * 2) Deterministic audio extractor (EN/ES) if meta is missing/invalid
 * 3) Optional LLM backstop (you can wire later). Returns same shape.
 */
export function chooseCustomerName(
  meta: ConvosoMeta,
  segments: Array<{ speaker: "agent" | "customer"; text: string; startMs: number }>,
  llmGuess?: { first_name: string | null; last_name: string | null; confidence: number; evidence_ts?: string | null; evidence_quote?: string | null } // optional
): NameChoice {
  // 1) Try Convoso meta
  const fname = clean(meta.customer_first_name);
  const lname = clean(meta.customer_last_name);
  const full = clean(meta.customer_full_name);

  let metaFirst: string | null = null;
  let metaLast: string | null = null;

  if (valid(fname) || valid(lname)) {
    metaFirst = valid(fname) ? cap(fname) : null;
    metaLast  = valid(lname) ? cap(lname) : null;
  } else if (valid(full)) {
    const s = splitFullName(full);
    metaFirst = s.first;
    metaLast  = s.last;
  }

  // 2) Deterministic audio extraction
  const nameFromAudio = extractCustomerName(
    segments.map(s => ({ speaker: s.speaker, text: s.text, start_ms: s.startMs })),
    meta?.agent_name || undefined
  );

  // 3) Optional LLM backstop if both are weak (wire later if you want)
  const hasStrongMeta = !!metaFirst && (metaLast !== null || true);
  const metaChoice: NameChoice | null = hasStrongMeta
    ? {
        first_name: metaFirst,
        last_name: metaLast,
        confidence: 1.0,
        source: "convoso_meta",
        evidence_ts: null,
        evidence_quote: "from Convoso metadata",
        alternate: nameFromAudio.confidence > 0.6
          ? {
              first_name: nameFromAudio.first_name,
              last_name: nameFromAudio.last_name,
              confidence: nameFromAudio.confidence,
              source: "audio_extract",
              evidence_ts: nameFromAudio.evidence_ts,
              evidence_quote: nameFromAudio.evidence_quote
            }
          : null
      }
    : null;

  if (metaChoice) return metaChoice;

  // If no valid meta, fall back to audio
  if (nameFromAudio.confidence >= 0.6) {
    return {
      first_name: nameFromAudio.first_name,
      last_name: nameFromAudio.last_name,
      confidence: nameFromAudio.confidence,
      source: "audio_extract",
      evidence_ts: nameFromAudio.evidence_ts,
      evidence_quote: nameFromAudio.evidence_quote,
      alternate: llmGuess && llmGuess.confidence > nameFromAudio.confidence
        ? {
            first_name: llmGuess.first_name,
            last_name: llmGuess.last_name,
            confidence: llmGuess.confidence,
            source: "llm_backstop",
            evidence_ts: llmGuess.evidence_ts ?? null,
            evidence_quote: llmGuess.evidence_quote ?? null
          }
        : null
    };
  }

  // If both are weak, but LLM backstop exists and is decent
  if (llmGuess && llmGuess.confidence >= 0.75) {
    return {
      first_name: llmGuess.first_name,
      last_name: llmGuess.last_name,
      confidence: llmGuess.confidence,
      source: "llm_backstop",
      evidence_ts: llmGuess.evidence_ts ?? null,
      evidence_quote: llmGuess.evidence_quote ?? null,
      alternate: nameFromAudio.confidence > 0.4
        ? {
            first_name: nameFromAudio.first_name,
            last_name: nameFromAudio.last_name,
            confidence: nameFromAudio.confidence,
            source: "audio_extract",
            evidence_ts: nameFromAudio.evidence_ts,
            evidence_quote: nameFromAudio.evidence_quote
          }
        : null
    };
  }

  // Nothing good
  return {
    first_name: null,
    last_name: null,
    confidence: 0,
    source: "audio_extract",
    evidence_ts: null,
    evidence_quote: null,
    alternate: null
  };
}