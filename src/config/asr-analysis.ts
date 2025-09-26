import { z } from "zod";

export type KeywordWeight = [string, number];

export const DEFAULTS = {
  asr: {
    model: "nova-2-phonecall" as const,
    utt_split: 1.1,
    diarize: true,
    utterances: true,
    smart_format: true,
    punctuate: true,
    numerals: true,
    paragraphs: true,
    detect_entities: true,
    keywords: [
      ["Aetna", 2],
      ["Ambetter", 2],
      ["Anthem", 2],
      ["Blue Cross", 2],
      ["Cigna", 2],
      ["Humana", 2],
      ["Kaiser", 2],
      ["Molina", 2],
      ["Paramount", 2],
      ["United", 2],
      ["First Health", 2]
    ] as KeywordWeight[]
  },
  money: {
    premiumHundredsIfUnder: 50,
    feeHundredsIfUnder: 20,
    priceCarrierWindowMs: 15000
  },
  rebuttal: {
    windowMs: 30000
  },
  interrupt: {
    maxGapMs: 300,
    prevMinDurMs: 1500
  }
} as const;

export const KeywordWeightSchema = z.tuple([z.string().min(1), z.number().int().min(1).max(5)]);

export const AsrSchema = z.object({
  model: z.enum(["nova-2-phonecall", "nova-2", "nova-3"]),
  utt_split: z.number().min(0.4).max(2.0),
  diarize: z.boolean(),
  utterances: z.boolean(),
  smart_format: z.boolean(),
  punctuate: z.boolean(),
  numerals: z.boolean(),
  paragraphs: z.boolean(),
  detect_entities: z.boolean(),
  keywords: z.array(KeywordWeightSchema)
});

export const MoneySchema = z.object({
  premiumHundredsIfUnder: z.number().int().min(0).max(200),
  feeHundredsIfUnder: z.number().int().min(0).max(200),
  priceCarrierWindowMs: z.number().int().min(0).max(120000)
});

export const RebuttalSchema = z.object({
  windowMs: z.number().int().min(1000).max(600000)
});

export const InterruptSchema = z.object({
  maxGapMs: z.number().int().min(50).max(2000),
  prevMinDurMs: z.number().int().min(200).max(5000)
});

export const SettingsSchema = z.object({
  asr: AsrSchema,
  money: MoneySchema,
  rebuttal: RebuttalSchema,
  interrupt: InterruptSchema
});

export type Settings = z.infer<typeof SettingsSchema>;

export function mergeSettings(partial: Partial<Settings>): Settings {
  return {
    asr: {
      ...DEFAULTS.asr,
      ...(partial.asr || {})
    },
    money: {
      ...DEFAULTS.money,
      ...(partial.money || {})
    },
    rebuttal: {
      ...DEFAULTS.rebuttal,
      ...(partial.rebuttal || {})
    },
    interrupt: {
      ...DEFAULTS.interrupt,
      ...(partial.interrupt || {})
    }
  };
}