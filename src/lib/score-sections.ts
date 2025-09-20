// Deterministic section scoring based on transcript analysis
import type { Segment } from "./asr-nova2";

export type SectionScores = {
  greeting: number;
  discovery: number;
  benefits: number;
  objections: number;
  compliance: number;
  closing: number;
  qa_score: number;
};

export function scoreSections(
  segments: Segment[],
  rebuttals: { missed: number; askedForCard: boolean },
  saleStatus?: string
): SectionScores {
  const scores: SectionScores = {
    greeting: 0,
    discovery: 0,
    benefits: 0,
    objections: 0,
    compliance: 0,
    closing: 0,
    qa_score: 0
  };

  if (!segments.length) return scores;

  const transcript = segments.map(s => s.text.toLowerCase()).join(" ");
  const agentSegments = segments.filter(s => s.speaker === "agent");
  const firstMinuteAgent = agentSegments.filter(s => s.startMs <= 60000);

  // GREETING (0-100): Did agent introduce themselves and company?
  const first30sAgent = agentSegments.filter(s => s.startMs <= 30000);
  if (first30sAgent.length > 0) {
    const greetingText = first30sAgent.map(s => s.text.toLowerCase()).join(" ");
    let greetingScore = 0;

    // Check for name introduction
    if (/my name is|this is|i'm|i am/.test(greetingText)) {
      greetingScore += 40;
    }

    // Check for company mention
    if (/calling from|with|representing/.test(greetingText)) {
      greetingScore += 30;
    }

    // Check for purpose/benefit mention
    if (/help|save|benefits?|coverage|plan/.test(greetingText)) {
      greetingScore += 30;
    }

    scores.greeting = Math.min(100, greetingScore);
  }

  // DISCOVERY (0-100): Questions asked in first minute
  if (firstMinuteAgent.length > 0) {
    const discoveryText = firstMinuteAgent.map(s => s.text).join(" ");
    const questionMarkers = [
      /\?/g,
      /\b(what|when|where|who|why|how|do you|are you|have you|can you|could you|would you)\b/gi,
      /\b(tell me|let me know|share with me)\b/gi
    ];

    let questionCount = 0;
    questionMarkers.forEach(pattern => {
      const matches = discoveryText.match(pattern);
      if (matches) questionCount += matches.length;
    });

    // Score based on question count (3+ questions = 100)
    scores.discovery = Math.min(100, Math.round((questionCount / 3) * 100));
  }

  // BENEFITS (0-100): Did agent explain value propositions?
  const benefitKeywords = [
    /save|saving|discount/gi,
    /coverage|cover|protect/gi,
    /benefit|advantage|include/gi,
    /free|no cost|complimentary/gi,
    /value|worth|quality/gi
  ];

  let benefitMentions = 0;
  benefitKeywords.forEach(pattern => {
    const matches = transcript.match(pattern);
    if (matches) benefitMentions += matches.length;
  });

  // Score based on benefit mentions (5+ = 100)
  scores.benefits = Math.min(100, Math.round((benefitMentions / 5) * 100));

  // OBJECTIONS (0-100): Based on rebuttal performance
  if (rebuttals.missed === 0) {
    scores.objections = 100;
  } else if (rebuttals.missed <= 1) {
    scores.objections = 70;
  } else if (rebuttals.missed <= 2) {
    scores.objections = 40;
  } else {
    scores.objections = 20;
  }

  // Bonus for asking for card after rebuttal
  if (rebuttals.askedForCard && scores.objections < 100) {
    scores.objections = Math.min(100, scores.objections + 20);
  }

  // COMPLIANCE (0-100): Check for required disclosures
  let complianceScore = 0;

  // Recording disclosure
  if (/recorded|recording|quality|training/i.test(transcript)) {
    complianceScore += 25;
  }

  // Not insurance/supplement disclosure
  if (/not insurance|supplement|in addition to|alongside/i.test(transcript)) {
    complianceScore += 25;
  }

  // Monthly cost disclosure
  if (/per month|monthly|a month|\$\d+/i.test(transcript)) {
    complianceScore += 25;
  }

  // Enrollment/activation fee disclosure
  if (/enrollment|activation|one.?time|sign.?up fee/i.test(transcript)) {
    complianceScore += 25;
  }

  scores.compliance = complianceScore;

  // CLOSING (0-100): Based on outcome and close attempt quality
  const hasCardRequest = /card|credit|debit|payment/i.test(transcript);
  const hasUrgency = /today|now|limited|expire|special/i.test(transcript);
  const hasConfirmation = /confirm|verify|process|charge/i.test(transcript);

  if (saleStatus === "sale") {
    scores.closing = 100;
  } else if (saleStatus === "post_date") {
    scores.closing = 80;
  } else if (hasCardRequest) {
    // Attempted close
    let closeScore = 40;
    if (hasUrgency) closeScore += 20;
    if (hasConfirmation) closeScore += 20;
    scores.closing = closeScore;
  } else {
    scores.closing = 0;
  }

  // Calculate overall QA score (weighted average)
  const weights = {
    greeting: 0.15,
    discovery: 0.20,
    benefits: 0.20,
    objections: 0.20,
    compliance: 0.15,
    closing: 0.10
  };

  scores.qa_score = Math.round(
    scores.greeting * weights.greeting +
    scores.discovery * weights.discovery +
    scores.benefits * weights.benefits +
    scores.objections * weights.objections +
    scores.compliance * weights.compliance +
    scores.closing * weights.closing
  );

  return scores;
}