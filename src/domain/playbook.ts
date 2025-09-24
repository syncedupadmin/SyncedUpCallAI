// === OPENING OBJECTIONS (first ~30s) ===
// Sourced from your "Opening Rebuttals" 1–6: too many calls, not looking, weeks ago, just info,
// already insured, call me back. EN + ES paraphrase variants.
export const OPENING_OBJECTION_FAMILIES = {
  too_many_calls: {
    customer: [
      "you're the 10th person", "so many calls", "stop calling", "everyone keeps calling",
      "me han llamado", "muchos me llaman", "demasiadas llamadas"
    ],
    agent: [
      // your counter themes: enrollment center, "all your options", "best plan/price", quick qualification
      "enrollment center", "all your options", "best plan", "best price",
      "ask you a few questions", "are you insured now", "calificado", "opciones", "mejor plan", "mejor precio"
    ]
  },
  not_looking: {
    customer: [
      "never looking for insurance", "i wasn't looking", "didn't ask for insurance",
      "no estaba buscando", "nunca busqué seguro"
    ],
    agent: [
      "you qualify for group plans", "fraction of the cost", "are you insured now",
      "planes de grupo", "fracción del costo"
    ]
  },
  weeks_ago: {
    customer: [
      "that was weeks ago", "i did that weeks ago", "hice eso hace semanas"
    ],
    agent: [
      "you qualify for group plans", "fraction of the cost", "are you insured now",
      "planes de grupo", "fracción del costo"
    ]
  },
  just_info: {
    customer: [
      "just looking for information", "send info", "solo quería información", "solo información"
    ],
    agent: [
      "not here to pressure", "help you", "are you insured now",
      "no para presionar", "a ayudarte"
    ]
  },
  already_insured: {
    customer: [
      "already have insurance", "i'm covered", "ya tengo seguro", "ya estoy cubierto"
    ],
    agent: [
      "nationwide broker", "all your options", "group plans", "save $", "individual or family",
      "corredor nacional", "todas sus opciones", "ahorrar", "plan individual o familiar"
    ]
  },
  call_me_back: {
    customer: [
      "call me back", "later", "tomorrow", "another time",
      "llámame luego", "más tarde", "mañana"
    ],
    agent: [
      "really important, let's do now", "few moments", "get you a quote",
      "importante ahora", "solo unos momentos", "cita rápida"
    ]
  }
} as const;

// === MONEY/CLOSE OBJECTIONS (after pitch starts) ===
// Based on your “send me in writing / legitimacy / spouse / too good to be true / doc search / tie-down” sets.
export const MONEY_OBJECTION_FAMILIES = {
  send_in_writing: {
    customer: [
      "send me something in writing", "email it", "i need to see it", "put it in writing",
      "mándame por correo", "quiero verlo por escrito", "envíame la información"
    ],
    agent: [
      "verification department", "welcome email", "i texted you a link", "final applications",
      "difference between pressure and urgency", "are we using a mastercard or visa",
      "departamento de verificación", "correo de bienvenida", "enlace", "urgencia", "visa o mastercard"
    ]
  },
  spouse: {
    customer: [
      "talk to my wife", "talk to my husband", "need to ask my spouse",
      "hablar con mi esposa", "hablar con mi esposo", "mi pareja"
    ],
    agent: [
      "three way", "call together", "green light", "conferencia", "juntos", "ahorro para la familia"
    ]
  },
  too_good_to_be_true: {
    customer: [
      "too good to be true", "sounds too good", "suena demasiado bueno", "no lo creo"
    ],
    agent: [
      "non profit association", "group coverage", "no deductible", "first dollar coverage",
      "asociación", "cobertura grupal", "sin deducible", "cobertura desde el día uno"
    ]
  },
  doctor_network: {
    customer: [
      "is my doctor covered", "doctor in network", "mi doctor", "en la red"
    ],
    agent: [
      "largest ppo", "network savings", "healthgrades", "multiplan", "firsthealth"
    ]
  },
  affordability_tie_down: {
    customer: [
      // “customer won’t give price” or quotes unrealistically low price
      "i can afford about", "only pay", "hundred a month", "cien al mes", "no quiero decir precio"
    ],
    agent: [
      "help me help you", "swing $", "no deductible", "best option", "move on to another call",
      "ayúdame a ayudarte", "mejor opción", "sin deducible"
    ]
  },
  time_tie_down: {
    customer: [
      "start in a few months", "wait a few months", "más adelante", "en unos meses"
    ],
    agent: [
      "within the next 30 days", "save $100-$200 per month", "peace of mind",
      "dentro de 30 días", "ahorrar", "tranquilidad"
    ]
  }
} as const;

// When we consider “money/close” started.
// As soon as any benefit keywords or price words appear, we treat following stalls as money-phase.
export const PITCH_STARTED_MARKERS = [
  "copay", "deductible", "out of pocket", "ppo", "hmo", "rx", "premium", "$", "per month",
  "copago", "deducible", "gastos máximos", "mensual"
];

// agent asking for the card (used for close/after-rebuttal tracking)
export const CARD_ASK = [
  "what card do you want to use", "read me the card number", "card number", "expiration", "cvv",
  "routing and account", "are we using a visa or mastercard",
  "qué tarjeta", "número de tarjeta", "vencimiento", "cvv", "ruta y cuenta", "visa o mastercard"
];

// Temporary PLAYBOOK export for backward compatibility with rules-engine.ts
export const PLAYBOOK = {
  timezone: "America/New_York",
  opening_window_ms: 30_000,
  opening_fuzzy_threshold: 0.62,
  opening_objections: {
    greeting: ["who is this", "who am i speaking with"],
    why_call: ["why are you calling", "what is this about"],
    identity: ["who are you calling for", "verify my identity"],
    wrong_person: ["wrong number", "that's not me"],
    busy: ["i'm busy", "can't talk right now", "driving"],
    callback: ["call me back", "call later", "tomorrow"],
    dnc: ["do not call", "stop calling"],
    already_covered: ["i already bought a plan", "i already have insurance"],
    other: []
  },
  money: {
    enrollment_fee_label: ["enrollment fee", "activation", "sign-up", "cargo inicial", "cuota de inscripción"]
  },
  outcomes: {
    phrases: {
      post_date: ["post date", "post-date", "charge on", "process on", "charge it on", "run it on", "bill on"],
      sale_confirm: [
        "payment processed", "payment approved", "charge went through",
        "you're all set", "all set", "welcome to", "congratulations",
        "successfully processed", "transaction approved", "card approved",
        "went through", "all good", "you're good to go", "good to go",
        "charged your card", "payment successful", "transaction successful",
        "enrollment complete", "enrolled", "you're now covered",
        "effective today", "coverage starts", "policy is active"
      ]
    },
    esign: {
      sent: ["texted you a link", "e-sign", "electronic signature"],
      confirmed: ["i signed", "sent it back", "completed"]
    }
  },
  objections: {
    families: {
      pricing: ["too much", "too high", "expensive"],
      spouse: ["talk to my spouse", "ask my wife"],
      benefits: ["what do i get", "don't understand"],
      trust: ["sounds like a scam", "license", "proof"],
      callback: ["call me back", "later"],
      already_covered: ["already have", "ya tengo plan"],
      bank: ["declined", "insufficient", "falló la tarjeta"]
    },
    match_window_sec: 30,
    max_tracked: 6
  }
};
