import Ajv from 'ajv';
const ajv = new Ajv({ allErrors: true, strict: false });
export const ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    reason_primary: { enum: ['pricing','duplicate_policy','spouse_approval','bank_decline','benefits_confusion','trust_scam_fear','already_covered','agent_miscommunication','followup_never_received','requested_callback','other'] },
    reason_secondary: { type: 'string' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    qa_score: { type: 'integer', minimum: 0, maximum: 100 },
    script_adherence: { type: 'integer', minimum: 0, maximum: 100 },
    sentiment_agent: { type: 'number', minimum: -1, maximum: 1 },
    sentiment_customer: { type: 'number', minimum: -1, maximum: 1 },
    risk_flags: { type: 'array', items: { type: 'string' } },
    actions: { type: 'array', items: { type: 'string' } },
    key_quotes: { type: 'array', items: { type: 'object', properties: { ts: { type: 'string' }, quote: { type: 'string' } }, required: ['ts','quote'] } },
    summary: { type: 'string' }
  },
  required: ['reason_primary','confidence','qa_score','script_adherence','summary']
} as const;
export const validateAnalysis = ajv.compile(ANALYSIS_SCHEMA);
