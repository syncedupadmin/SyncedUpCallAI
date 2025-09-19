export type RebuttalBucket =
  | "opening" | "prequal" | "tie_down_affordability" | "tie_down_time"
  | "send_in_writing" | "spouse" | "legitimacy" | "assume_sale";

export type Rebuttal = {
  id: string;                 // stable ID you'll see in the report
  bucket: RebuttalBucket;
  // Short intent description (what this rebuttal is trying to achieve)
  intent: string;
  // A few paraphrased examples (English + Spanish OK)
  exemplars: string[];
  // Light keyword anchors that should appear in some form
  keywords?: string[];
  // Optional "should not match" hints (prevents false positives)
  negatives?: string[];
};

export const REBUTTALS: Rebuttal[] = [
  {
    id: "OPEN_PREQUAL_LOOP",
    bucket: "prequal",
    intent: "Pivot from stall to discovery; keep them on the line",
    exemplars: [
      "Let me ask you a couple quick questions to see what you qualify for.",
      "We haven't even found you a plan yet — two quick questions first.",
      "Déjame hacerte unas preguntas rápidas para ver si calificas."
    ],
    keywords: ["questions", "qualify", "haven't even found", "preguntas", "calificas"]
  },
  {
    id: "LEGITIMACY_VERIFY",
    bucket: "legitimacy",
    intent: "Address scam/legitimacy by explaining verification & licensed process",
    exemplars: [
      "I get the concern. We verify everything and I'm a licensed agent; we'll confirm your info during enrollment.",
      "Puedo verificar mi licencia y validamos todo en el proceso antes de cualquier pago."
    ],
    keywords: ["verify", "licensed", "license", "verificar", "licencia"]
  },
  {
    id: "ASSUME_SALE_VISA_MC",
    bucket: "assume_sale",
    intent: "Assume the close and move to payment method",
    exemplars: [
      "We'll get you set up now — do you prefer Visa or MasterCard?",
      "Perfect, let's finalize this — ¿Visa o MasterCard?"
    ],
    keywords: ["Visa", "MasterCard", "set up now", "finalize"]
  },
  {
    id: "SEND_INFO_URGENCY",
    bucket: "send_in_writing",
    intent: "Handle 'send me info' with urgency options",
    exemplars: [
      "I can text a quick summary, but options change daily; this takes two minutes to lock in.",
      "Te puedo mandar un resumen, pero las opciones cambian; son dos minutos para asegurar esto."
    ],
    keywords: ["text", "summary", "options change", "dos minutos", "asegurar"]
  },
  {
    id: "SPOUSE_SOFT_CLOSE",
    bucket: "spouse",
    intent: "Spouse approval without losing the close; set micro-commitment",
    exemplars: [
      "Totally — we'll include your spouse. Let's secure your spot now and you can loop them in tonight.",
      "Entiendo, incluimos a tu esposo/a; reservamos ahora y revisan juntos hoy."
    ],
    keywords: ["spouse", "tonight", "include", "esposo", "esposa"]
  },
  {
    id: "TIE_DOWN_AFFORD",
    bucket: "tie_down_affordability",
    intent: "Anchor to a reasonable monthly range",
    exemplars: [
      "If it's under about two hundred a month, that's reasonable for you, right?",
      "Si queda por debajo de doscientos al mes, ¿te funciona?"
    ],
    keywords: ["month", "reasonable", "doscientos", "al mes"]
  },
  {
    id: "TIE_DOWN_TIME",
    bucket: "tie_down_time",
    intent: "Confirm they can finish now",
    exemplars: [
      "You've got two minutes now to wrap this up, right?",
      "Tienes dos minutos ahora para terminar esto, ¿sí?"
    ],
    keywords: ["two minutes", "now", "dos minutos", "ahora"]
  }
];