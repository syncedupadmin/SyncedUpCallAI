import Ajv from 'ajv';
const ajv = new Ajv({ allErrors: true, strict: false, coerceTypes: true });

// More relaxed schema - accept various formats and coerce
export const ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    reason_primary: {
      type: ['string', 'null'],
      nullable: true
    },
    reason_secondary: { type: ['string', 'null'], nullable: true },
    confidence: { type: ['number', 'null'], minimum: 0, maximum: 1, nullable: true },
    qa_score: { type: ['number', 'integer', 'string', 'null'], nullable: true },
    script_adherence: { type: ['number', 'integer', 'string', 'null'], nullable: true },
    sentiment_agent: { type: ['number', 'null'], minimum: -1, maximum: 1, nullable: true },
    sentiment_customer: { type: ['number', 'null'], minimum: -1, maximum: 1, nullable: true },
    risk_flags: { type: ['array', 'null'], items: { type: 'string' }, nullable: true },
    actions: { type: ['array', 'null'], items: { type: 'string' }, nullable: true },
    key_quotes: { type: ['array', 'null'], nullable: true },
    summary: { type: 'string' }
  },
  required: ['summary'],
  additionalProperties: true // Allow extra fields
} as const;

export const validateAnalysis = ajv.compile(ANALYSIS_SCHEMA);

// Soft validation fallback - extract summary if possible
export function softValidateAnalysis(data: any): { valid: boolean; summary?: string; data?: any } {
  if (!data || typeof data !== 'object') {
    return { valid: false };
  }

  // Try to find summary field (case-insensitive)
  const summaryKey = Object.keys(data).find(k => k.toLowerCase() === 'summary');
  const summary = summaryKey ? data[summaryKey] : null;

  if (summary && typeof summary === 'string' && summary.length > 0) {
    // Build minimal valid object
    const minimalData = {
      summary,
      reason_primary: data.reason_primary || null,
      confidence: parseFloat(data.confidence) || 0.5,
      qa_score: parseInt(data.qa_score) || 50,
      script_adherence: parseInt(data.script_adherence) || 50,
      risk_flags: Array.isArray(data.risk_flags) ? data.risk_flags : [],
      actions: Array.isArray(data.actions) ? data.actions : [],
      key_quotes: Array.isArray(data.key_quotes) ? data.key_quotes : []
    };
    return { valid: true, summary, data: minimalData };
  }

  return { valid: false };
}
