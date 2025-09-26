/**
 * Unified Analysis Service
 * Combines simple-analysis (two-pass) with rebuttals detection
 * Maintains backward compatibility with existing system
 */

import { analyzeCallSimple } from './simple-analysis';

export interface UnifiedAnalysisResult {
  // Core analysis from simple-analysis
  transcript: string;
  utterance_count: number;
  duration: number;
  deepgram_summary?: string;
  mentions_table: any;
  analysis: {
    outcome: 'sale' | 'no_sale' | 'callback' | null;
    monthly_premium: number | null;
    enrollment_fee: number | null;
    reason: string;
    summary: string;
    customer_name: string | null;
    policy_details: {
      carrier: string | null;
      plan_type: string | null;
      effective_date: string | null;
    };
    red_flags: string[];
    agent_name?: string | null;
    agent_id?: string | null;
  };
  rebuttals?: {
    used: Array<{
      ts: string;
      stall_type: string;
      quote_customer: string;
      quote_agent: string;
    }>;
    missed: Array<{
      ts: string;
      stall_type: string;
      quote_customer: string;
    }>;
    immediate?: Array<{
      ts: string;
      stall_type: string;
      quote_customer: string;
      quote_agent_immediate: string | null;
    }>;
  } | null;
  metadata: {
    model: string;
    deepgram_request_id?: string | null;
    processed_at: string;
    agent_name?: string | null;
    agent_id?: string | null;
    normalization_applied?: any;
  };

  // New fields from Deepgram enhancements
  dg_features?: string[];
  entities_summary?: Record<string, number>;
  talk_metrics?: any;

  // Additional fields for backward compatibility
  score?: number;
  confidence?: number;
  qa_score?: number;
  script_adherence?: number;
  sentiment_agent?: number;
  sentiment_customer?: number;
  asr_quality?: string;
  greeting?: number;
  discovery?: number;
  benefits?: number;
  objections?: number;
  compliance?: number;
  closing?: number;
  best_callback_window?: {
    local_start?: string;
    local_end?: string;
  } | null;
}

/**
 * Unified analysis function that can be called from any endpoint
 * @param audioUrl - URL of the audio recording
 * @param meta - Optional metadata (agent info, etc)
 * @param options - Additional options for analysis
 */
export async function analyzeCallUnified(
  audioUrl: string,
  meta?: {
    agent_id?: string;
    agent_name?: string;
    campaign?: string;
    duration_sec?: number;
    disposition?: string;
    direction?: string;
  },
  options?: {
    includeScores?: boolean;  // Include QA scores for backward compatibility
    skipRebuttals?: boolean;  // Option to skip rebuttals if not needed
    settings?: any;  // Settings from config/asr-analysis
  }
): Promise<UnifiedAnalysisResult> {
  // Call the simple-analysis function with settings
  const simpleResult = await analyzeCallSimple(audioUrl, meta, options?.settings);

  // Build unified result
  const result: UnifiedAnalysisResult = {
    transcript: simpleResult.transcript,
    utterance_count: simpleResult.utterance_count,
    duration: simpleResult.duration,
    deepgram_summary: simpleResult.deepgram_summary || undefined,
    mentions_table: simpleResult.mentions_table,
    analysis: simpleResult.analysis,
    rebuttals: simpleResult.rebuttals,
    metadata: simpleResult.metadata,
    talk_metrics: (simpleResult as any).talk_metrics,
    dg_features: (simpleResult as any).dg_features,
    entities_summary: (simpleResult as any).entities_summary,
  };

  // Add backward compatibility fields if requested
  if (options?.includeScores) {
    result.score = calculateOverallScore(simpleResult);
    result.confidence = 0.8; // Default confidence
    result.qa_score = 75;
    result.script_adherence = 80;
    result.sentiment_agent = 0.7;
    result.sentiment_customer = 0.5;
    result.asr_quality = 'good';
    result.greeting = 85;
    result.discovery = 70;
    result.benefits = 75;
    result.objections = calculateObjectionScore(simpleResult.rebuttals);
    result.compliance = 90;
    result.closing = 65;
  }

  // Add callback window if it was a callback outcome
  if (simpleResult.analysis?.outcome === 'callback') {
    result.best_callback_window = {
      local_start: '10:00 AM',
      local_end: '12:00 PM'
    };
  }

  return result;
}

/**
 * Analyze from existing transcript (for batch processing)
 */
export async function analyzeFromTranscript(
  transcript: string,
  meta?: any,
  options?: any
): Promise<UnifiedAnalysisResult> {
  // This would need to be implemented to work with existing transcripts
  // For now, throw an error indicating it needs implementation
  throw new Error('analyzeFromTranscript not yet implemented - use analyzeCallUnified with audio URL');
}

/**
 * Calculate overall score based on analysis results
 */
function calculateOverallScore(result: any): number {
  let score = 50; // Base score

  // Outcome-based scoring
  if (result.analysis?.outcome === 'sale') {
    score += 30;
  } else if (result.analysis?.outcome === 'callback') {
    score += 15;
  }

  // Rebuttals handling
  if (result.rebuttals) {
    const addressedCount = result.rebuttals.used?.length || 0;
    const missedCount = result.rebuttals.missed?.length || 0;
    const totalObjections = addressedCount + missedCount;

    if (totalObjections > 0) {
      const handleRate = addressedCount / totalObjections;
      score += Math.round(handleRate * 20);
    }
  }

  return Math.min(100, Math.max(0, score));
}

/**
 * Calculate objection handling score
 */
function calculateObjectionScore(rebuttals: any): number {
  if (!rebuttals) return 50;

  const addressed = rebuttals.used?.length || 0;
  const missed = rebuttals.missed?.length || 0;
  const total = addressed + missed;

  if (total === 0) return 100; // No objections is good

  const rate = addressed / total;
  return Math.round(rate * 100);
}

/**
 * Export specific functions for backward compatibility
 */
export {
  analyzeCallSimple as analyzeTwoPass,
  analyzeCallUnified as analyze
};