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
  crm: { show_contact_info: true, show_disposition: true }
} as const;

export type Playbook = typeof PLAYBOOK;