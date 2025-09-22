import { db } from '@/server/db';
import { logInfo, logError } from '@/lib/log';

// Call classification types
export const CALL_CLASSIFICATIONS = {
  ANALYZABLE: 'analyzable',
  VOICEMAIL: 'voicemail',
  DEAD_AIR: 'dead_air',
  HOLD_MUSIC: 'hold_music',
  WRONG_NUMBER: 'wrong_number',
  TECHNICAL_FAILURE: 'technical_failure',
  AUTOMATED_SYSTEM: 'automated_system',
  NO_AGENT: 'no_agent',
  INSUFFICIENT_CONTENT: 'insufficient_content',
  ULTRA_SHORT: 'ultra_short'
} as const;

export type CallClassification = typeof CALL_CLASSIFICATIONS[keyof typeof CALL_CLASSIFICATIONS];

// Quality thresholds
const QUALITY_THRESHOLDS = {
  MIN_WORD_COUNT: 20,
  MIN_AGENT_WORDS: 10,
  MIN_CONVERSATION_TURNS: 2,
  MAX_SILENCE_RATIO: 0.85,
  MIN_ASR_CONFIDENCE: 0.3,
  MIN_QUALITY_SCORE: 30
};

// Pattern lists (will be loaded from DB in production)
const VOICEMAIL_KEYWORDS = [
  'leave a message',
  'leave your message',
  'after the beep',
  'after the tone',
  'voicemail',
  'voice mail',
  'not available',
  'currently unavailable',
  'reached the voice',
  'press pound',
  'mailbox',
  'unavailable to take',
  'record your message',
  'at the tone'
];

const WRONG_NUMBER_KEYWORDS = [
  'wrong number',
  'who is this',
  'didn\'t call',
  'don\'t know you',
  'mistake',
  'wrong person',
  'not expecting',
  'how did you get'
];

const AUTOMATED_KEYWORDS = [
  'press one',
  'press two',
  'press zero',
  'main menu',
  'for customer service',
  'para español',
  'your call is important',
  'please stay on the line',
  'all representatives',
  'next available'
];

interface CallMetrics {
  word_count: number;
  agent_word_count: number;
  customer_word_count: number;
  silence_ratio: number;
  asr_confidence: number;
  speaker_turns: number;
  has_music?: boolean;
  has_dial_tone?: boolean;
  voice_activity_ratio?: number;
  duration_sec: number;
}

interface ClassificationResult {
  classification: CallClassification;
  is_analyzable: boolean;
  filter_reason: string;
  confidence: number;
  quality_score: number;
}

/**
 * Extract speaker word counts from diarized transcript
 */
function extractSpeakerMetrics(diarized: any[]): {
  agent_words: number;
  customer_words: number;
  speaker_turns: number;
} {
  if (!diarized || !Array.isArray(diarized)) {
    return { agent_words: 0, customer_words: 0, speaker_turns: 0 };
  }

  let agent_words = 0;
  let customer_words = 0;
  let speaker_turns = 0;
  let last_speaker = '';

  for (const segment of diarized) {
    const speaker = (segment.speaker || '').toLowerCase();
    const text = segment.text || '';
    const words = text.trim().split(/\s+/).filter(Boolean);

    if (speaker !== last_speaker) {
      speaker_turns++;
      last_speaker = speaker;
    }

    if (speaker === 'agent' || speaker === 'a') {
      agent_words += words.length;
    } else if (speaker === 'customer' || speaker === 'c' || speaker === 'b') {
      customer_words += words.length;
    }
  }

  return { agent_words, customer_words, speaker_turns };
}

/**
 * Calculate silence ratio from transcript and duration
 */
function calculateSilenceRatio(word_count: number, duration_sec: number): number {
  if (duration_sec <= 0) return 1;

  // Assume average speaking rate of 150 words per minute
  const expected_words = (duration_sec / 60) * 150;
  const speech_ratio = Math.min(1, word_count / expected_words);

  return 1 - speech_ratio;
}

/**
 * Detect patterns in transcript
 */
function detectPatterns(transcript: string): {
  has_voicemail: boolean;
  has_wrong_number: boolean;
  has_automated: boolean;
  matched_pattern?: string;
} {
  const lower = transcript.toLowerCase();

  // Check voicemail patterns
  for (const pattern of VOICEMAIL_KEYWORDS) {
    if (lower.includes(pattern)) {
      return {
        has_voicemail: true,
        has_wrong_number: false,
        has_automated: false,
        matched_pattern: pattern
      };
    }
  }

  // Check wrong number patterns
  for (const pattern of WRONG_NUMBER_KEYWORDS) {
    if (lower.includes(pattern)) {
      return {
        has_voicemail: false,
        has_wrong_number: true,
        has_automated: false,
        matched_pattern: pattern
      };
    }
  }

  // Check automated system patterns
  for (const pattern of AUTOMATED_KEYWORDS) {
    if (lower.includes(pattern)) {
      return {
        has_voicemail: false,
        has_wrong_number: false,
        has_automated: true,
        matched_pattern: pattern
      };
    }
  }

  return {
    has_voicemail: false,
    has_wrong_number: false,
    has_automated: false
  };
}

/**
 * Calculate overall quality score
 */
function calculateQualityScore(metrics: CallMetrics): number {
  let score = 50; // Base score

  // Word count factor (up to +20)
  if (metrics.word_count >= 100) score += 20;
  else if (metrics.word_count >= 50) score += 15;
  else if (metrics.word_count >= 30) score += 10;
  else if (metrics.word_count >= 20) score += 5;

  // Agent participation (up to +15)
  const agent_ratio = metrics.agent_word_count / Math.max(1, metrics.word_count);
  score += Math.round(agent_ratio * 15);

  // Conversation flow (up to +15)
  if (metrics.speaker_turns >= 10) score += 15;
  else if (metrics.speaker_turns >= 5) score += 10;
  else if (metrics.speaker_turns >= 2) score += 5;

  // Silence penalty (up to -20)
  if (metrics.silence_ratio > 0.7) score -= 20;
  else if (metrics.silence_ratio > 0.5) score -= 10;
  else if (metrics.silence_ratio > 0.3) score -= 5;

  // ASR confidence bonus (up to +10)
  score += Math.round(metrics.asr_confidence * 10);

  return Math.max(0, Math.min(100, score));
}

/**
 * Main classification function
 */
export async function classifyCallQuality(
  call_id: string,
  transcript: string,
  diarized: any[],
  duration_sec: number,
  asr_confidence: number = 1
): Promise<ClassificationResult> {
  try {
    const word_count = transcript.trim().split(/\s+/).filter(Boolean).length;
    const speaker_metrics = extractSpeakerMetrics(diarized);
    const silence_ratio = calculateSilenceRatio(word_count, duration_sec);

    const metrics: CallMetrics = {
      word_count,
      agent_word_count: speaker_metrics.agent_words,
      customer_word_count: speaker_metrics.customer_words,
      silence_ratio,
      asr_confidence,
      speaker_turns: speaker_metrics.speaker_turns,
      duration_sec
    };

    // 1. Ultra short check
    if (word_count < 5) {
      return {
        classification: CALL_CLASSIFICATIONS.ULTRA_SHORT,
        is_analyzable: false,
        filter_reason: `Only ${word_count} words detected`,
        confidence: 1.0,
        quality_score: 0
      };
    }

    // 2. Dead air check
    if (word_count < QUALITY_THRESHOLDS.MIN_WORD_COUNT || silence_ratio > QUALITY_THRESHOLDS.MAX_SILENCE_RATIO) {
      return {
        classification: CALL_CLASSIFICATIONS.DEAD_AIR,
        is_analyzable: false,
        filter_reason: `Only ${word_count} words, ${Math.round(silence_ratio * 100)}% silence`,
        confidence: 0.95,
        quality_score: calculateQualityScore(metrics)
      };
    }

    // 3. Pattern detection
    const patterns = detectPatterns(transcript);

    if (patterns.has_voicemail) {
      return {
        classification: CALL_CLASSIFICATIONS.VOICEMAIL,
        is_analyzable: false,
        filter_reason: `Voicemail detected: "${patterns.matched_pattern}"`,
        confidence: 0.92,
        quality_score: calculateQualityScore(metrics)
      };
    }

    if (patterns.has_wrong_number) {
      return {
        classification: CALL_CLASSIFICATIONS.WRONG_NUMBER,
        is_analyzable: false,
        filter_reason: `Wrong number pattern: "${patterns.matched_pattern}"`,
        confidence: 0.88,
        quality_score: calculateQualityScore(metrics)
      };
    }

    if (patterns.has_automated) {
      return {
        classification: CALL_CLASSIFICATIONS.AUTOMATED_SYSTEM,
        is_analyzable: false,
        filter_reason: `Automated system: "${patterns.matched_pattern}"`,
        confidence: 0.85,
        quality_score: calculateQualityScore(metrics)
      };
    }

    // 4. No agent check
    if (metrics.agent_word_count < QUALITY_THRESHOLDS.MIN_AGENT_WORDS) {
      return {
        classification: CALL_CLASSIFICATIONS.NO_AGENT,
        is_analyzable: false,
        filter_reason: `Agent spoke only ${metrics.agent_word_count} words`,
        confidence: 0.9,
        quality_score: calculateQualityScore(metrics)
      };
    }

    // 5. Technical failure check
    if (asr_confidence < QUALITY_THRESHOLDS.MIN_ASR_CONFIDENCE) {
      return {
        classification: CALL_CLASSIFICATIONS.TECHNICAL_FAILURE,
        is_analyzable: false,
        filter_reason: `ASR confidence too low: ${Math.round(asr_confidence * 100)}%`,
        confidence: 0.9,
        quality_score: calculateQualityScore(metrics)
      };
    }

    // 6. Insufficient content check
    if (metrics.speaker_turns < QUALITY_THRESHOLDS.MIN_CONVERSATION_TURNS) {
      return {
        classification: CALL_CLASSIFICATIONS.INSUFFICIENT_CONTENT,
        is_analyzable: false,
        filter_reason: `Only ${metrics.speaker_turns} speaker turns`,
        confidence: 0.8,
        quality_score: calculateQualityScore(metrics)
      };
    }

    // 7. Final quality check
    const quality_score = calculateQualityScore(metrics);
    if (quality_score < QUALITY_THRESHOLDS.MIN_QUALITY_SCORE) {
      return {
        classification: CALL_CLASSIFICATIONS.INSUFFICIENT_CONTENT,
        is_analyzable: false,
        filter_reason: `Quality score too low: ${quality_score}`,
        confidence: 0.75,
        quality_score
      };
    }

    // Call is analyzable
    return {
      classification: CALL_CLASSIFICATIONS.ANALYZABLE,
      is_analyzable: true,
      filter_reason: '',
      confidence: 1.0,
      quality_score
    };

  } catch (error) {
    logError('Call quality classification failed', error, { call_id });

    // Default to analyzable on error to not block processing
    return {
      classification: CALL_CLASSIFICATIONS.ANALYZABLE,
      is_analyzable: true,
      filter_reason: '',
      confidence: 0.5,
      quality_score: 50
    };
  }
}

/**
 * Save quality metrics to database
 */
export async function saveQualityMetrics(
  call_id: string,
  transcript: string,
  diarized: any[],
  duration_sec: number,
  asr_confidence: number = 1,
  additional_metrics?: Partial<CallMetrics>
): Promise<void> {
  try {
    const classification = await classifyCallQuality(
      call_id,
      transcript,
      diarized,
      duration_sec,
      asr_confidence
    );

    const word_count = transcript.trim().split(/\s+/).filter(Boolean).length;
    const speaker_metrics = extractSpeakerMetrics(diarized);
    const silence_ratio = calculateSilenceRatio(word_count, duration_sec);

    await db.none(`
      INSERT INTO call_quality_metrics (
        call_id,
        word_count,
        agent_word_count,
        customer_word_count,
        speaker_count,
        speaker_turns,
        silence_ratio,
        asr_confidence,
        quality_score,
        classification,
        is_analyzable,
        filter_reason,
        filter_confidence,
        has_music,
        voice_activity_ratio
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      ON CONFLICT (call_id) DO UPDATE SET
        word_count = $2,
        agent_word_count = $3,
        customer_word_count = $4,
        speaker_count = $5,
        speaker_turns = $6,
        silence_ratio = $7,
        asr_confidence = $8,
        quality_score = $9,
        classification = $10,
        is_analyzable = $11,
        filter_reason = $12,
        filter_confidence = $13,
        updated_at = NOW()
    `, [
      call_id,
      word_count,
      speaker_metrics.agent_words,
      speaker_metrics.customer_words,
      diarized.length > 0 ? 2 : 1, // Assume 2 speakers if diarized
      speaker_metrics.speaker_turns,
      silence_ratio,
      asr_confidence,
      classification.quality_score,
      classification.classification,
      classification.is_analyzable,
      classification.filter_reason,
      classification.confidence,
      additional_metrics?.has_music || false,
      additional_metrics?.voice_activity_ratio || (1 - silence_ratio)
    ]);

    // Log filtered calls for analysis
    if (!classification.is_analyzable) {
      await db.none(`
        INSERT INTO filtered_calls_log (
          call_id,
          classification,
          filter_reason,
          confidence,
          duration_sec,
          word_count,
          processing_time_saved_ms,
          cost_saved_cents
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        call_id,
        classification.classification,
        classification.filter_reason,
        classification.confidence,
        duration_sec,
        word_count,
        2000, // Estimated 2 seconds saved per filtered call
        1     // Estimated 1 cent saved per filtered call
      ]);

      logInfo({
        event_type: 'call_filtered',
        call_id,
        classification: classification.classification,
        reason: classification.filter_reason,
        quality_score: classification.quality_score
      });
    }

  } catch (error) {
    logError('Failed to save quality metrics', error, { call_id });
    // Don't throw - we don't want to block processing
  }
}

/**
 * Check if a call should be analyzed based on quality metrics
 */
export async function shouldAnalyzeCall(call_id: string): Promise<{
  should_analyze: boolean;
  classification?: CallClassification;
  reason?: string;
}> {
  try {
    const metrics = await db.oneOrNone(`
      SELECT is_analyzable, classification, filter_reason
      FROM call_quality_metrics
      WHERE call_id = $1
    `, [call_id]);

    if (!metrics) {
      // No metrics yet - default to analyze
      return { should_analyze: true };
    }

    return {
      should_analyze: metrics.is_analyzable,
      classification: metrics.classification,
      reason: metrics.filter_reason
    };

  } catch (error) {
    logError('Failed to check call quality', error, { call_id });
    // Default to analyze on error
    return { should_analyze: true };
  }
}

/**
 * Get filtering statistics
 */
export async function getFilteringStats(days: number = 7): Promise<any> {
  try {
    const stats = await db.oneOrNone(`
      SELECT
        COUNT(*) as total_calls,
        COUNT(*) FILTER (WHERE is_analyzable = true) as analyzed,
        COUNT(*) FILTER (WHERE is_analyzable = false) as filtered,
        COUNT(*) FILTER (WHERE classification = 'voicemail') as voicemails,
        COUNT(*) FILTER (WHERE classification = 'dead_air') as dead_air,
        COUNT(*) FILTER (WHERE classification = 'no_agent') as no_agent,
        COUNT(*) FILTER (WHERE classification = 'wrong_number') as wrong_numbers,
        ROUND(
          COUNT(*) FILTER (WHERE is_analyzable = false)::DECIMAL /
          NULLIF(COUNT(*), 0) * 100, 1
        ) as filter_rate_pct,
        SUM(CASE WHEN is_analyzable = false THEN 2 ELSE 0 END) as seconds_saved,
        SUM(CASE WHEN is_analyzable = false THEN 1 ELSE 0 END) as cents_saved
      FROM call_quality_metrics
      WHERE created_at >= NOW() - INTERVAL '%s days'
    `, [days]);

    return stats;
  } catch (error) {
    logError('Failed to get filtering stats', error);
    return null;
  }
}