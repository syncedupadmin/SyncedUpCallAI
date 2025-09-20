// src/domain/playbook.ts
export const PLAYBOOK = {
  version: "1.0",
  timezone: "America/New_York",
  languages: ["en","es"],

  outcomes: {
    precedence: ["post_date","sale","none"] as const,
    phrases: {
      post_date: [
        "post date","post-date","charge on","process on","run on","will be charged on",
        "cargamos el","se procesa el","fecha de cobro"
      ],
      sale_confirm: [
        "payment processed","payment approved","charge went through",
        "pago aprobado","pago procesado","cargó correctamente","you are all set"
      ]
    },
    esign: {
      sent: ["texted you a link","e-sign","electronic signature","firma electrónica","enlace"],
      confirmed: ["i signed","sent it back","completed","ya firmé","ya lo envié","lo devolví"]
    }
  },

  money: {
    unit: "monthly",
    keep_cents: true,
    enrollment_fee_label: ["enrollment fee","activation","sign-up","cargo inicial","cuota de inscripción"]
  },

  objections: {
    families: {
      pricing: ["too much","too high","expensive","muy caro","$"],
      spouse: ["talk to my spouse","ask my wife","hablar con mi esposa","mi marido"],
      benefits: ["what do i get","don't understand","no entiendo","qué incluye"],
      trust: ["sounds like a scam","license","proof","esto es estafa","legítimo"],
      callback: ["call me back","later","mañana","luego"],
      already_covered: ["already have","ya tengo plan","tengo seguro"],
      bank: ["declined","insufficient","falló la tarjeta","rechazada"]
    },
    match_window_sec: 30,
    min_rebuttals_for_control: 2,
    max_tracked: 6
  },

  plan: { fields: ["plan_name"] as const },
  crm: { show_contact_info: true, show_disposition: true },

  // Opening window (0–30s)
  opening_window_ms: 30_000,

  // Minimum similarity 0..1 to count as a match (fuzzy; not word-for-word)
  opening_fuzzy_threshold: 0.62,

  // Opening objections taxonomy (1–6) + DNC + Already Covered
  // These are patterns; we fuzzy-match token sets so variants still hit.
  opening_objections: {
    // 1) GREETING / WHO IS THIS?
    greeting: [
      "who is this", "who am i speaking with", "who's calling",
      "what company is this", "identify yourself", "say your name", "which company"
    ],

    // 2) WHY ARE YOU CALLING?
    why_call: [
      "why are you calling", "what is this about", "why'd you call me",
      "what do you want", "what do you need from me"
    ],

    // 3) IDENTITY / VERIFY ME (can overlap greeting; we keep both)
    identity: [
      "who are you calling for", "what's my name", "verify my identity",
      "do you know who i am", "what is my info"
    ],

    // 4) WRONG PERSON / WRONG NUMBER
    wrong_person: [
      "wrong number", "that's not me", "not the person", "you have the wrong person",
      "i'm not", "not"
    ],

    // 5) BUSY / TIME BLOCK
    busy: [
      "i'm busy", "can't talk right now", "driving", "at work", "in a meeting",
      "bad time", "not a good time"
    ],

    // 6) CALLBACK REQUEST
    callback: [
      "call me back", "call later", "later today", "another time", "tomorrow",
      "can you call back", "reach me later"
    ],

    // EXPLICIT DNC (take me off the list / do not call / stop calling)
    dnc: [
      "do not call", "don't call me", "stop calling", "take me off the list",
      "put me on the do not call list", "remove me from your list"
    ],

    // ALREADY COVERED / ALREADY BOUGHT
    already_covered: [
      "i already bought a plan", "i already purchased insurance",
      "i already have insurance", "i already signed up",
      "i already got coverage", "i already have a plan"
    ],

    other: []
  }
} as const;

export type Playbook = typeof PLAYBOOK;