/**
 * Deterministic money normalization for health insurance pricing
 * Handles ASR transcription errors and verbal price patterns
 */

export type MoneyContext = 'monthly_premium' | 'first_month_bill' | 'enrollment_fee' | 'generic';

/**
 * Normalize money values based on context and quote patterns
 * Applies deterministic rules for ASR correction
 *
 * @param value - The raw numeric value extracted
 * @param context - The field context (premium, enrollment, etc.)
 * @param quote - The verbatim quote from transcript
 * @returns Normalized dollar amount
 */
export function normalizeMoney(value: number, context: MoneyContext, quote: string): number {
  // Handle null/undefined/NaN
  if (!Number.isFinite(value)) return value;

  const quoteLower = quote.toLowerCase();

  // Rule 4: Preserve legitimate sub-hundred values if explicitly stated
  // Check for explicit "twenty-seven fifty", "twenty-seven dollars", "fifty dollars" patterns
  const legitimateSubHundredPatterns = [
    /twenty[- ]?seven[- ]?(fifty|dollars)/,
    /fifty[- ]?dollars/,
    /ninety[- ]?nine[- ]?dollars/,
    /\$27\.50/,
    /\$50\.00/,
    /\$99\.00/
  ];

  if (legitimateSubHundredPatterns.some(pattern => pattern.test(quoteLower))) {
    // These are legitimate values, return as-is
    return value;
  }

  // Rule 3: Handle verbal patterns like "four sixty", "five sixty-seven", etc.
  // These should be normalized to 460, 567, etc.
  const verbalHundredsPattern = /\b(one|two|three|four|five|six|seven|eight|nine)\s+(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)/i;
  if (verbalHundredsPattern.test(quoteLower)) {
    // If the value is < 100 and matches verbal pattern, it's likely hundreds were dropped
    if (value < 100) {
      // Parse the verbal pattern properly
      const hundreds = parseVerbalHundreds(quoteLower);
      if (hundreds !== null) {
        return hundreds;
      }
      // Fallback: multiply by 10 if it looks like tens
      if (value >= 10 && value < 100) {
        return value * 10;
      }
    }
  }

  // Rule 1: Premium/first bill context - multiply by 100 if < 50
  if ((context === 'monthly_premium' || context === 'first_month_bill') && value < 50) {
    return value * 100;
  }

  // Rule 2: Enrollment fee context - multiply by 100 if < 10
  if (context === 'enrollment_fee' && value < 10) {
    return value * 100;
  }

  // Default: return value as-is
  return value;
}

/**
 * Parse verbal hundreds patterns like "four sixty" -> 460
 */
function parseVerbalHundreds(text: string): number | null {
  const wordToNum: { [key: string]: number } = {
    'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
    'six': 6, 'seven': 7, 'eight': 8, 'nine': 9,
    'twenty': 20, 'thirty': 30, 'forty': 40, 'fifty': 50,
    'sixty': 60, 'seventy': 70, 'eighty': 80, 'ninety': 90
  };

  const matches = text.toLowerCase().match(
    /\b(one|two|three|four|five|six|seven|eight|nine)\s+(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[- ]?(one|two|three|four|five|six|seven|eight|nine))?\b/
  );

  if (matches) {
    const hundreds = wordToNum[matches[1]] || 0;
    const tens = wordToNum[matches[2]] || 0;
    const ones = matches[3] ? wordToNum[matches[3]] : 0;
    return hundreds * 100 + tens + ones;
  }

  return null;
}

/**
 * Parse raw money value from various formats
 * @param rawValue - String value from transcript (e.g., "$5.10 and 56¢", "four sixty")
 * @returns Numeric value or null if unparseable
 */
export function parseMoneyValue(rawValue: string): number | null {
  if (!rawValue) return null;

  const cleaned = rawValue.toLowerCase().trim();

  // Handle "$X.YZ and AB¢" format
  const dollarsAndCentsPattern = /\$?(\d+(?:\.\d+)?)\s+and\s+(\d+)¢?/;
  const match = cleaned.match(dollarsAndCentsPattern);
  if (match) {
    const dollars = parseFloat(match[1]);
    const cents = parseInt(match[2]);
    return dollars + (cents / 100);
  }

  // Handle standard dollar amounts
  const dollarPattern = /\$?(\d+(?:\.\d+)?)/;
  const dollarMatch = cleaned.match(dollarPattern);
  if (dollarMatch) {
    return parseFloat(dollarMatch[1]);
  }

  // Handle verbal patterns
  const verbalValue = parseVerbalHundreds(cleaned);
  if (verbalValue !== null) {
    return verbalValue;
  }

  return null;
}

/**
 * Format normalized money value for display
 * @param value - Normalized dollar amount
 * @returns Formatted string (e.g., "$450.00")
 */
export function formatMoney(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return 'N/A';
  return `$${value.toFixed(2)}`;
}

// ===== Legacy code below for backward compatibility =====

type MoneyExtraction = {
  value: number;                 // dollars, cents as decimal
  source: string;                // original phrase
  corrected: boolean;            // true if we applied a hundreds inference
  reason?: string;               // why we corrected
};

const WORD_TO_NUM: Record<string, number> = {
  zero:0, one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9,
  ten:10, eleven:11, twelve:12, thirteen:13, fourteen:14, fifteen:15, sixteen:16, seventeen:17, eighteen:18, nineteen:19,
  twenty:20, thirty:30, forty:40, fifty:50, sixty:60, seventy:70, eighty:80, ninety:90, hundred:100
};

function wordsToHundreds(seq: string): number | null {
  // Handles patterns like "four sixty", "five twenty nine", "one oh five"
  const toks = seq.toLowerCase().replace(/-/g, " ").split(/\s+/).filter(Boolean);
  if (!toks.length) return null;

  // "one hundred twenty five" → 125 (fallback)
  if (toks.includes("hundred")) {
    let hundreds = 0, tens = 0, ones = 0;
    for (let i=0;i<toks.length;i++){
      const w = toks[i];
      if (w === "hundred") { hundreds = (WORD_TO_NUM[toks[i-1]] ?? 0) * 100; continue; }
      if (WORD_TO_NUM[w] != null) {
        if (WORD_TO_NUM[w] >= 20) tens = WORD_TO_NUM[w];
        else if (WORD_TO_NUM[w] < 20) ones = WORD_TO_NUM[w];
      }
      if (w === "oh") ones = 0; // "one oh five" handled by explicit 'oh'
    }
    const val = hundreds + tens + ones;
    return val > 0 ? val : null;
  }

  // Two- or three-token tens shorthand: "four sixty" → 460 ; "five twenty nine" → 529 ; "one oh five" → 105
  const d1 = WORD_TO_NUM[toks[0]];
  if (d1 == null) return null;

  // "one oh five"
  if (toks[1] === "oh" && WORD_TO_NUM[toks[2]] != null) return d1*100 + WORD_TO_NUM[toks[2]];

  // "four sixty" / "five twenty" / "eight ninety nine"
  const tens = WORD_TO_NUM[toks[1]];
  if (tens != null && tens % 10 === 0 && tens >= 20 && tens <= 90) {
    const ones = WORD_TO_NUM[toks[2] ?? "zero"] ?? 0;
    return d1*100 + tens + ones;
  }

  return null;
}

export function extractMoneyWithContext(text: string, ctx: MoneyContext = "generic"): MoneyExtraction[] {
  const out: MoneyExtraction[] = [];

  // 1) Numeric money with optional "and NN¢": "$4.60 and 61¢"
  const numRe = /\$?\s*(\d{1,3}(?:,\d{3})*|\d)(?:\.(\d{1,2}))?\s*(?:and\s+(\d{1,2})\s*(?:cents|¢))?/gi;
  text.replace(numRe, (_m, dollarsRaw, decRaw, centsRaw, idx, str) => {
    const source = str.slice(Math.max(0, idx - 25), idx + 40); // snippet
    const dollars = Number(String(dollarsRaw).replace(/,/g, ""));
    const dec = decRaw ? Number(decRaw) : null;
    const centsExplicit = centsRaw ? Number(centsRaw) : null;

    let value = dec != null ? dollars + dec / 100 : dollars;
    let corrected = false;
    let reason = "";

    // If we have the odd "$4.60 and 61¢" pattern and the context is premium/bill, rebuild as 460.61
    const looksLikeHundredsDropped = (ctx === "monthly_premium" || ctx === "first_month_bill") &&
      dollars < 50 && ((dec != null && dec % 10 === 0) || centsExplicit != null);

    if (looksLikeHundredsDropped) {
      const tens = dec != null ? Math.floor(dec / 10) : 0;     // ".60" → 6 tens
      const cents = centsExplicit != null ? centsExplicit : (dec != null && dec % 10 !== 0 ? dec : 0);
      value = dollars * 100 + tens * 10 + cents / 100;
      corrected = true;
      reason = "hundreds_inference_from_tens_and_cents";
    }

    // Enrollment fee often misheard as $1.25 when agent says "one twenty five"
    if (ctx === "enrollment_fee" && value < 10) {
      value = value * 100;
      corrected = true;
      reason = "enrollment_fee_hundreds_inference";
    }

    out.push({ value: roundCents(value), source: _m.trim(), corrected, reason: corrected ? reason : undefined });
    return _m;
  });

  // 2) Word patterns without $: "four sixty and sixty-one cents", "one twenty five"
  // cents part
  const centsMatch = text.match(/\b(\d{1,2})\s*(?:cents|¢)\b/i);
  const centsVal = centsMatch ? Number(centsMatch[1]) : null;

  // candidate phrases of up to 3 words for the "four sixty" family
  const wordCandidates = Array.from(text.matchAll(/\b(one|two|three|four|five|six|seven|eight|nine)\s+(oh|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:\s+(one|two|three|four|five|six|seven|eight|nine))?\b/gi));
  for (const m of wordCandidates) {
    const phrase = m[0];
    const hundreds = wordsToHundreds(phrase);
    if (hundreds != null) {
      const value = roundCents(hundreds + (centsVal != null ? centsVal/100 : 0));
      out.push({ value, source: phrase + (centsVal!=null ? ` and ${centsVal}¢` : ""), corrected: true, reason: "parsed_words_as_hundreds" });
    }
  }

  // De-duplicate near-duplicates by value within 1 cent
  return dedupeMoney(out);
}

function roundCents(v: number): number {
  return Math.round(v * 100) / 100;
}

function dedupeMoney(items: MoneyExtraction[]): MoneyExtraction[] {
  const seen = new Map<number, MoneyExtraction>();
  for (const it of items) {
    const key = Math.round(it.value * 100);
    if (!seen.has(key)) seen.set(key, it);
  }
  return Array.from(seen.values()).sort((a,b)=>a.value-b.value);
}

// Helper functions for integration
export function contextForUtterance(uText: string): "monthly_premium"|"first_month_bill"|"enrollment_fee"|"generic" {
  const t = uText.toLowerCase();
  if (/\b(first month'?s? bill|first payment)\b/.test(t)) return "first_month_bill";
  if (/\b(enrollment fee|activation fee)\b/.test(t)) return "enrollment_fee";
  if (/\b(premium|monthly|per month|monthly payment)\b/.test(t)) return "monthly_premium";
  return "generic";
}

export function extractPrices(utterances: Array<{speaker:number|string, transcript:string}>) {
  const events: any[] = [];
  for (const u of utterances) {
    const ctx = contextForUtterance(u.transcript);
    const monies = extractMoneyWithContext(u.transcript, ctx);
    for (const m of monies) {
      // Filter out obvious non-price patterns
      const lowerUtterance = u.transcript.toLowerCase();

      // Skip if it's likely a phone number (10+ digit patterns)
      if (/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/.test(u.transcript)) continue;

      // Skip if it's likely a date (month names, "November 1", etc)
      if (/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}\b/i.test(u.transcript)) continue;
      if (/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/.test(u.transcript)) continue;

      // Skip if it's an address (house number at start)
      if (/^\d{1,5}\s+[A-Za-z]/.test(u.transcript.trim())) continue;

      // Skip if it's a percentage context
      if (m.value === 100 && lowerUtterance.includes("100%")) continue;

      // Skip very small values unless they're in a pricing context
      if (m.value < 10 && ctx === "generic") continue;

      events.push({
        type: ctx === "enrollment_fee" ? "enrollment_fee" : ctx === "first_month_bill" ? "first_month_bill" : "price_quote",
        value: m.value,
        corrected: m.corrected,
        reason: m.reason,
        quote: m.source,
        speaker: u.speaker,
        utterance: u.transcript
      });
    }
  }
  return events;
}