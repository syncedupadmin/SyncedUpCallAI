export type RebuttalType =
  | "pricing" | "spouse" | "benefits" | "trust" | "callback" | "already_covered" | "bank" | "other";

export const STALLS: Record<RebuttalType, RegExp[]> = {
  pricing: [/too.*(much|high|expensive)/i, /\$\s*\d+.*(too|can'?t)/i],
  spouse: [/(ask|talk)\s+(my|the)\s+(wife|husband|spouse|partner)/i],
  benefits: [/(don'?t|do not).*(understand|what.*get|benefit)/i],
  trust: [/(sounds|seems).*(scam|fake)/i, /(who.*are.*you|proof|license)/i],
  callback: [/(call|text)\s+me\s+back|later|tomorrow|another time/i],
  already_covered: [/(already|have).*(plan|coverage|insurance)/i],
  bank: [/(card|bank).*(declined|insufficient|failed|issuer)/i],
  other: [/^$/] // fallback
};

export const REBUTTALS: Record<RebuttalType, RegExp[]> = {
  pricing: [/break.*down.*cost/i, /(save|discount|waive).*(fee|enroll)/i],
  spouse: [/let.*loop.*(wife|husband)/i, /3-?way.*call/i],
  benefits: [/pcp|deductible|copay|oop|max/i, /(here'?s|let me).*summary/i],
  trust: [/(license|npi|dept.*insurance)/i, /(send|text).*proof|site|reviews/i],
  callback: [/(quick|5|seven).*(minute|min).*now/i, /if.*doesn'?t.*help.*hang.*up/i],
  already_covered: [/(compare|better|upgrade)/i],
  bank: [/(try|retry).*payment|different.*card|ach/i],
  other: [/^$/]
};