// src/lib/name-extract.ts

export type Seg = {
  speaker: "agent" | "customer";
  text: string;
  start_ms: number;
};

export type NameExtractResult = {
  first_name: string | null;
  last_name: string | null;
  confidence: number;  // 0..1
  evidence_ts: string | null;
  evidence_quote: string | null;
};

const MMSS = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

// Common name patterns
const NAME_PATTERNS = {
  en: {
    intro: [
      /my name is (\w+)(?: (\w+))?/i,
      /i'm (\w+)(?: (\w+))?/i,
      /this is (\w+)(?: (\w+))?/i,
      /call me (\w+)/i,
      /speaking with (\w+)(?: (\w+))?/i,
      /talking to (\w+)(?: (\w+))?/i,
    ],
    verify: [
      /is this (\w+)(?: (\w+))?/i,
      /am i speaking with (\w+)(?: (\w+))?/i,
      /can i speak with (\w+)(?: (\w+))?/i,
      /looking for (\w+)(?: (\w+))?/i,
    ],
    response: [
      /yes,? (?:this is |i'm |it's )?(\w+)/i,
      /that's me/i,
      /speaking/i,
    ]
  },
  es: {
    intro: [
      /mi nombre es (\w+)(?: (\w+))?/i,
      /me llamo (\w+)(?: (\w+))?/i,
      /soy (\w+)(?: (\w+))?/i,
      /habla (\w+)(?: (\w+))?/i,
    ],
    verify: [
      /hablo con (\w+)(?: (\w+))?/i,
      /es (?:usted |el señor |la señora )?(\w+)(?: (\w+))?/i,
      /busco a (\w+)(?: (\w+))?/i,
    ],
    response: [
      /sí,? (?:soy |es )?(\w+)/i,
      /el mismo/i,
      /la misma/i,
    ]
  }
};

export function extractCustomerName(segments: Seg[], agentName?: string): NameExtractResult {
  let firstName: string | null = null;
  let lastName: string | null = null;
  let confidence = 0;
  let evidenceTs: string | null = null;
  let evidenceQuote: string | null = null;

  // Look in first 30 seconds
  const firstMinuteSegs = segments.filter(s => s.start_ms <= 30000);

  // Check for explicit customer introduction
  for (const seg of firstMinuteSegs) {
    if (seg.speaker !== "customer") continue;

    // Check English patterns
    for (const pattern of NAME_PATTERNS.en.intro) {
      const match = seg.text.match(pattern);
      if (match) {
        firstName = match[1] || null;
        lastName = match[2] || null;
        confidence = 0.9;
        evidenceTs = MMSS(seg.start_ms);
        evidenceQuote = seg.text;
        break;
      }
    }

    // Check Spanish patterns
    if (!firstName) {
      for (const pattern of NAME_PATTERNS.es.intro) {
        const match = seg.text.match(pattern);
        if (match) {
          firstName = match[1] || null;
          lastName = match[2] || null;
          confidence = 0.9;
          evidenceTs = MMSS(seg.start_ms);
          evidenceQuote = seg.text;
          break;
        }
      }
    }

    if (firstName) break;
  }

  // If no explicit intro, look for agent verification and customer confirmation
  if (!firstName) {
    for (let i = 0; i < firstMinuteSegs.length - 1; i++) {
      const seg = firstMinuteSegs[i];
      if (seg.speaker !== "agent") continue;

      // Check if agent is asking for/verifying a name
      for (const pattern of [...NAME_PATTERNS.en.verify, ...NAME_PATTERNS.es.verify]) {
        const match = seg.text.match(pattern);
        if (match) {
          // Look at next customer response
          const nextCustomerSeg = firstMinuteSegs.slice(i + 1).find(s => s.speaker === "customer");
          if (nextCustomerSeg) {
            // Check for confirmation
            const confirmPatterns = [/yes/i, /yeah/i, /correct/i, /that's me/i, /speaking/i, /sí/i, /correcto/i, /el mismo/i];
            if (confirmPatterns.some(p => nextCustomerSeg.text.match(p))) {
              firstName = match[1] || null;
              lastName = match[2] || null;
              confidence = 0.75;
              evidenceTs = MMSS(nextCustomerSeg.start_ms);
              evidenceQuote = `Agent: "${seg.text}" → Customer: "${nextCustomerSeg.text}"`;
              break;
            }
          }
        }
      }
      if (firstName) break;
    }
  }

  // Clean up names
  if (firstName) {
    firstName = firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
  }
  if (lastName) {
    lastName = lastName.charAt(0).toUpperCase() + lastName.slice(1).toLowerCase();
  }

  // Filter out agent name if provided
  if (agentName && firstName && firstName.toLowerCase() === agentName.toLowerCase()) {
    firstName = null;
    lastName = null;
    confidence = 0;
  }

  return {
    first_name: firstName,
    last_name: lastName,
    confidence,
    evidence_ts: evidenceTs,
    evidence_quote: evidenceQuote
  };
}