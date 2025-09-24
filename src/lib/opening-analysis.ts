/**
 * Opening Analysis - Unified Module
 * Combines opening-control, opening-extractor, and opening-analyzer functionality
 */

import type { Segment } from "./asr-nova2";
import { db } from '@/server/db';
import { logInfo, logError } from '@/lib/log';

// ============================================
// TYPES & INTERFACES
// ============================================

interface WordTiming {
  word: string;
  start: number;
  end: number;
  confidence?: number;
}

interface OpeningMetrics {
  pace_wpm: number;
  silence_ratio: number;
  call_continued: boolean;
  disposition: string;
  greeting_type?: string;
  company_mentioned: boolean;
  agent_name_mentioned: boolean;
  value_prop_mentioned: boolean;
  question_asked: boolean;
  // Rejection tracking
  rejection_detected?: boolean;
  rejection_type?: string;
  rejection_timestamp_ms?: number;
  rebuttal_attempted?: boolean;
  led_to_pitch?: boolean;
  rebuttal_to_outcome?: string;
}

interface OpeningPattern {
  phrase: string;
  success_rate: number;
  sample_count: number;
  avg_duration: number;
  conversion_rate: number;
}

interface PatternAnalysis {
  patterns: OpeningPattern[];
  insights: string[];
  recommendations: string[];
}

// ============================================
// OPENING CONTROL (from opening-control.ts)
// ============================================

export function openingAndControl(segments: Segment[]){
  const first90 = segments.filter(s => s.startMs <= 90_000);
  const agent = first90.filter(s=>s.speaker==="agent");
  const cust  = first90.filter(s=>s.speaker==="customer");

  const talkAgent = agent.reduce((a,s)=>a+(s.endMs-s.startMs),0)/1000;
  const talkCust  = cust.reduce((a,s)=>a+(s.endMs-s.startMs),0)/1000;
  const share = talkAgent / Math.max(1, talkAgent+talkCust);

  // soft cues for opening: name use, purpose, assume-the-sale language
  const txt = agent.map(s=>s.text.toLowerCase()).join(" ");
  const usedName = /\b(nick|sir|ma'?am|mr\.|ms\.)\b/i.test(txt); // or feed lead first name here
  const purpose  = /(help|get you set up|enroll|take care of this today)/i.test(txt);
  const assume   = /(today|right now|we'll get you set up)/i.test(txt);

  const checks = [usedName, purpose, assume].filter(Boolean).length;
  const opening_score = Math.round( (checks/3)*100 );

  // control: talk share in 0.55–0.70 and >2 questions/minute
  const questions = (txt.match(/\?/g)||[]).length;
  const duration = first90.length > 0 ? (first90[first90.length-1].endMs - first90[0].startMs) : 1;
  const qpm = questions / Math.max(1, duration/60000);
  let control_score = 70;
  if (share < 0.55 || share > 0.70) control_score -= 20;
  if (qpm < 2) control_score -= 10;
  control_score = Math.max(0, control_score);

  const fb: string[] = [];
  if (!usedName) fb.push("opening: didn't use name/rapport");
  if (!purpose)  fb.push("opening: purpose/benefit unclear");
  if (!assume)   fb.push("opening: no assume-the-sale language");
  if (qpm < 2)   fb.push("control: low discovery pace");
  if (share < 0.55) fb.push("control: caller dominated");
  if (share > 0.70) fb.push("control: agent monologue");

  return { opening_score, control_score, opening_feedback: fb };
}

// ============================================
// OPENING EXTRACTOR (from opening-extractor.ts)
// ============================================

/**
 * Calculate silence ratio from word timings
 */
function calculateSilenceRatio(words: WordTiming[], totalDurationMs: number = 30000): number {
  if (!words || words.length === 0) return 1.0;

  let totalSpeechMs = 0;
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    totalSpeechMs += (word.end - word.start);
  }

  const silenceMs = totalDurationMs - totalSpeechMs;
  return silenceMs / totalDurationMs;
}

/**
 * Detect rejection in opening
 */
function detectRejectionInOpening(transcript: string, words?: WordTiming[]): {
  detected: boolean;
  type?: string;
  timestamp_ms?: number;
} {
  const rejectionPatterns = {
    'not_interested': /not interested|don't want|no thanks|not for me/i,
    'no_time': /don't have time|busy|call.*later|bad time/i,
    'already_have': /already have|got one|covered|have insurance/i,
    'spam_fear': /stop calling|take me off|remove.*list|how did you get/i,
    'hostile': /fuck off|leave.*alone|harassment|hung up on/i,
    'spouse_decision': /talk.*spouse|wife|husband|partner.*decide/i
  };

  const lower = transcript.toLowerCase();

  for (const [type, pattern] of Object.entries(rejectionPatterns)) {
    if (pattern.test(lower)) {
      // Try to find timestamp if we have word timings
      let timestamp_ms: number | undefined;
      if (words && words.length > 0) {
        const match = lower.match(pattern);
        if (match) {
          // Find approximate position of rejection
          const rejectionPos = match.index || 0;
          const wordsUpToRejection = transcript.substring(0, rejectionPos).split(' ').length;
          if (words[wordsUpToRejection]) {
            timestamp_ms = words[wordsUpToRejection].start;
          }
        }
      }

      return {
        detected: true,
        type,
        timestamp_ms
      };
    }
  }

  return { detected: false };
}

/**
 * Detect if rebuttal was attempted after rejection
 */
function detectRebuttalAttempt(transcript: string, rejectionPos: number): boolean {
  // Look for text after rejection position
  const afterRejection = transcript.substring(rejectionPos);

  // Check for agent continuing to speak (rebuttal indicators)
  const rebuttalIndicators = [
    /understand|appreciate|hear you/i,
    /just.*quick|30 seconds|brief moment/i,
    /before you go|wait|hold on/i,
    /may I ask|curious|wondering/i,
    /save|benefit|help|protect/i
  ];

  return rebuttalIndicators.some(pattern => pattern.test(afterRejection));
}

/**
 * Determine if rebuttal led to successful outcome
 */
function determineRebuttalOutcome(call: any): {
  led_to_pitch: boolean;
  rebuttal_to_outcome: string;
} {
  const duration = call.duration_sec;
  const disposition = call.disposition?.toUpperCase();

  if (duration < 30) {
    return {
      led_to_pitch: false,
      rebuttal_to_outcome: 'immediate_hangup'
    };
  } else if (duration < 120) {
    return {
      led_to_pitch: true,
      rebuttal_to_outcome: 'pitched'
    };
  } else {
    if (disposition === 'SALE') {
      return {
        led_to_pitch: true,
        rebuttal_to_outcome: 'sale'
      };
    } else if (disposition === 'APPOINTMENT_SET') {
      return {
        led_to_pitch: true,
        rebuttal_to_outcome: 'appointment'
      };
    } else {
      return {
        led_to_pitch: true,
        rebuttal_to_outcome: 'pitched'
      };
    }
  }
}

/**
 * Detect greeting type from transcript
 */
function detectGreetingType(transcript: string): string {
  const lower = transcript.toLowerCase();

  if (lower.startsWith('hello')) return 'hello';
  if (lower.startsWith('hi')) return 'hi';
  if (lower.startsWith('hey')) return 'hey';
  if (lower.includes('good morning')) return 'good_morning';
  if (lower.includes('good afternoon')) return 'good_afternoon';
  if (lower.includes('good evening')) return 'good_evening';

  return 'other';
}

/**
 * Analyze linguistic features of opening
 */
function analyzeLinguisticFeatures(transcript: string, agentName?: string): {
  company_mentioned: boolean;
  agent_name_mentioned: boolean;
  value_prop_mentioned: boolean;
  question_asked: boolean;
} {
  const lower = transcript.toLowerCase();

  // Common company indicators
  const companyKeywords = ['calling from', 'with', 'representing', 'from', 'at'];
  const company_mentioned = companyKeywords.some(keyword => lower.includes(keyword));

  // Check if agent name is mentioned (if we have it)
  const agent_name_mentioned = agentName ?
    lower.includes(agentName.toLowerCase().split(' ')[0]) :
    lower.includes('my name is') || lower.includes('this is');

  // Value prop keywords
  const valueKeywords = ['help', 'save', 'offer', 'opportunity', 'benefit', 'improve', 'solution'];
  const value_prop_mentioned = valueKeywords.some(keyword => lower.includes(keyword));

  // Question detection
  const question_asked = transcript.includes('?') ||
    lower.includes('how are you') ||
    lower.includes('is this a good time') ||
    lower.includes('do you have a moment');

  return {
    company_mentioned,
    agent_name_mentioned,
    value_prop_mentioned,
    question_asked
  };
}

/**
 * Extract opening segment from a call
 */
export async function extractOpeningFromCall(callId: string): Promise<any> {
  try {
    // Get REAL call data with transcript
    const call = await db.oneOrNone(`
      SELECT
        c.id,
        c.recording_url,
        c.duration_sec,
        c.disposition,
        c.agent_name,
        c.campaign,
        t.words,
        t.text as full_transcript
      FROM calls c
      LEFT JOIN transcripts t ON t.call_id = c.id
      WHERE c.id = $1
    `, [callId]);

    if (!call) {
      logError('Call not found for opening extraction', null, { callId });
      return null;
    }

    if (!call.recording_url) {
      logInfo({
        event_type: 'opening_extraction_skipped',
        reason: 'no_recording',
        call_id: callId
      });
      return null;
    }

    // Check if opening already extracted
    const existing = await db.oneOrNone(`
      SELECT id FROM opening_segments WHERE call_id = $1
    `, [callId]);

    if (existing) {
      logInfo({
        event_type: 'opening_extraction_skipped',
        reason: 'already_exists',
        call_id: callId
      });
      return null;
    }

    // Extract first 30 seconds of words
    let openingWords: WordTiming[] = [];
    let openingText = '';

    if (call.words && Array.isArray(call.words)) {
      // Filter words in first 30 seconds (30000ms)
      openingWords = call.words.filter((w: any) =>
        w.end !== undefined && w.end <= 30000
      );
      openingText = openingWords.map(w => w.word).join(' ');
    } else if (call.full_transcript) {
      // Fallback: use first portion of transcript if no word timings
      const words = call.full_transcript.split(' ');
      // Estimate ~150 words per minute = 75 words in 30 seconds
      openingText = words.slice(0, 75).join(' ');
    }

    if (!openingText) {
      logInfo({
        event_type: 'opening_extraction_skipped',
        reason: 'no_transcript',
        call_id: callId
      });
      return null;
    }

    // Calculate REAL metrics from YOUR data
    const pace_wpm = openingWords.length > 0 ?
      (openingWords.length / 30) * 60 : // Words per minute
      (openingText.split(' ').length / 30) * 60;

    const silence_ratio = openingWords.length > 0 ?
      calculateSilenceRatio(openingWords) :
      0.2; // Default estimate if no word timings

    const call_continued = call.duration_sec > 30;

    // Analyze linguistic features
    const greeting_type = detectGreetingType(openingText);
    const linguisticFeatures = analyzeLinguisticFeatures(openingText, call.agent_name);

    // Calculate initial success score based on outcome
    let success_score = 0;
    if (call.disposition === 'SALE' || call.disposition === 'APPOINTMENT_SET') {
      success_score = 1.0;
    } else if (call.disposition === 'INTERESTED' || call.disposition === 'CALLBACK') {
      success_score = 0.7;
    } else if (call_continued) {
      success_score = 0.5;
    } else {
      success_score = 0.2;
    }

    // Calculate engagement score
    let engagement_score = 0;
    if (call_continued) engagement_score += 0.4;
    if (linguisticFeatures.question_asked) engagement_score += 0.2;
    if (linguisticFeatures.value_prop_mentioned) engagement_score += 0.2;
    if (pace_wpm >= 120 && pace_wpm <= 180) engagement_score += 0.2; // Optimal pace

    // Store in database
    const result = await db.one(`
      INSERT INTO opening_segments (
        call_id,
        recording_url,
        transcript,
        words,
        pace_wpm,
        silence_ratio,
        greeting_type,
        company_mentioned,
        agent_name_mentioned,
        value_prop_mentioned,
        question_asked,
        call_continued,
        disposition,
        duration_sec,
        success_score,
        engagement_score,
        agent_name,
        campaign
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      RETURNING id
    `, [
      callId,
      call.recording_url,
      openingText,
      JSON.stringify(openingWords),
      pace_wpm,
      silence_ratio,
      greeting_type,
      linguisticFeatures.company_mentioned,
      linguisticFeatures.agent_name_mentioned,
      linguisticFeatures.value_prop_mentioned,
      linguisticFeatures.question_asked,
      call_continued,
      call.disposition,
      call.duration_sec,
      success_score,
      engagement_score,
      call.agent_name,
      call.campaign
    ]);

    // Detect rejection in opening
    const rejection = detectRejectionInOpening(openingText, openingWords);
    let rebuttal_attempted = false;
    let rebuttal_outcome = { led_to_pitch: false, rebuttal_to_outcome: 'no_rejection' };

    if (rejection.detected) {
      // Check if rebuttal was attempted
      const rejectionPos = openingText.toLowerCase().indexOf(rejection.type || '');
      rebuttal_attempted = detectRebuttalAttempt(openingText, rejectionPos);

      // Determine outcome if rebuttal was attempted
      if (rebuttal_attempted) {
        rebuttal_outcome = determineRebuttalOutcome(call);
      }

      // Update opening_segments with rejection data
      await db.none(`
        UPDATE opening_segments
        SET rejection_detected = $1,
            rejection_type = $2,
            rejection_timestamp_ms = $3,
            rebuttal_attempted = $4,
            led_to_pitch = $5,
            rebuttal_to_outcome = $6
        WHERE id = $7
      `, [
        true,
        rejection.type,
        rejection.timestamp_ms,
        rebuttal_attempted,
        rebuttal_outcome.led_to_pitch,
        rebuttal_outcome.rebuttal_to_outcome,
        result.id
      ]);
    }

    logInfo({
      event_type: 'opening_extracted',
      call_id: callId,
      opening_id: result.id,
      pace_wpm,
      silence_ratio,
      call_continued,
      disposition: call.disposition,
      success_score,
      engagement_score,
      rejection_detected: rejection.detected,
      rejection_type: rejection.type,
      rebuttal_attempted,
      led_to_pitch: rebuttal_outcome.led_to_pitch
    });

    return {
      id: result.id,
      openingText,
      metrics: {
        pace_wpm,
        silence_ratio,
        call_continued,
        disposition: call.disposition,
        greeting_type,
        ...linguisticFeatures,
        success_score,
        engagement_score,
        rejection_detected: rejection.detected,
        rejection_type: rejection.type,
        rebuttal_attempted,
        ...rebuttal_outcome
      }
    };

  } catch (error: any) {
    logError('Failed to extract opening', error, { call_id: callId });
    throw error;
  }
}

/**
 * Extract openings from multiple calls in batch
 */
export async function extractOpeningsInBatch(limit: number = 100): Promise<{
  extracted: number;
  skipped: number;
  failed: number;
}> {
  const results = {
    extracted: 0,
    skipped: 0,
    failed: 0
  };

  try {
    // Get calls that need opening extraction
    const calls = await db.manyOrNone(`
      SELECT c.id
      FROM calls c
      LEFT JOIN opening_segments os ON os.call_id = c.id
      WHERE c.recording_url IS NOT NULL
      AND c.duration_sec IS NOT NULL
      AND os.id IS NULL
      ORDER BY c.created_at DESC
      LIMIT $1
    `, [limit]);

    logInfo({
      event_type: 'batch_extraction_started',
      total_calls: calls.length
    });

    for (const call of calls) {
      try {
        const result = await extractOpeningFromCall(call.id);
        if (result) {
          results.extracted++;
        } else {
          results.skipped++;
        }
      } catch (error) {
        results.failed++;
        logError('Failed to extract opening for call', error, { call_id: call.id });
      }
    }

    logInfo({
      event_type: 'batch_extraction_complete',
      ...results
    });

  } catch (error: any) {
    logError('Batch extraction failed', error);
    throw error;
  }

  return results;
}

/**
 * Get opening segment for a specific call
 */
export async function getOpeningForCall(callId: string): Promise<any> {
  return await db.oneOrNone(`
    SELECT * FROM opening_segments
    WHERE call_id = $1
  `, [callId]);
}

// ============================================
// OPENING ANALYZER (from opening-analyzer.ts)
// ============================================

/**
 * Extract common phrases from openings
 */
function extractCommonPhrases(openings: any[], minLength: number = 3): Map<string, number> {
  const phrases = new Map<string, number>();

  for (const opening of openings) {
    if (!opening.transcript) continue;

    const words = opening.transcript.toLowerCase().split(/\s+/);

    // Extract n-grams (phrases of length 3-7 words)
    for (let n = minLength; n <= Math.min(7, words.length); n++) {
      for (let i = 0; i <= words.length - n; i++) {
        const phrase = words.slice(i, i + n).join(' ');

        // Skip very common phrases
        if (isCommonPhrase(phrase)) continue;

        phrases.set(phrase, (phrases.get(phrase) || 0) + 1);
      }
    }
  }

  return phrases;
}

/**
 * Check if phrase is too common to be meaningful
 */
function isCommonPhrase(phrase: string): boolean {
  const commonPhrases = [
    'this is', 'how are', 'are you', 'you today',
    'i am', 'can i', 'would you', 'do you'
  ];

  return commonPhrases.some(common => phrase === common);
}

/**
 * Calculate success rate for a specific phrase
 */
function calculatePhraseSuccessRate(
  phrase: string,
  successfulOpenings: any[],
  failedOpenings: any[]
): number {
  const successCount = successfulOpenings.filter(o =>
    o.transcript && o.transcript.toLowerCase().includes(phrase)
  ).length;

  const failCount = failedOpenings.filter(o =>
    o.transcript && o.transcript.toLowerCase().includes(phrase)
  ).length;

  const total = successCount + failCount;
  if (total === 0) return 0;

  return successCount / total;
}

/**
 * Discover successful patterns from YOUR calls
 */
export async function discoverSuccessfulPatterns(): Promise<PatternAnalysis> {
  try {
    // Get YOUR successful openings (real data)
    const successfulOpenings = await db.manyOrNone(`
      SELECT *
      FROM opening_segments
      WHERE disposition IN ('SALE', 'APPOINTMENT_SET', 'INTERESTED')
      AND call_continued = true
      ORDER BY created_at DESC
      LIMIT 1000
    `);

    // Get failed openings for comparison
    const failedOpenings = await db.manyOrNone(`
      SELECT *
      FROM opening_segments
      WHERE call_continued = false
      OR disposition IN ('NOT_INTERESTED', 'HANGUP', 'DO_NOT_CALL')
      ORDER BY created_at DESC
      LIMIT 1000
    `);

    logInfo({
      event_type: 'pattern_discovery_started',
      successful_count: successfulOpenings.length,
      failed_count: failedOpenings.length
    });

    // Extract phrases from successful calls
    const successPhrases = extractCommonPhrases(successfulOpenings);
    const failPhrases = extractCommonPhrases(failedOpenings);

    // Find phrases that appear more in successful calls
    const patterns: OpeningPattern[] = [];

    for (const [phrase, count] of successPhrases) {
      // Skip if phrase is too rare
      if (count < 5) continue;

      const successRate = calculatePhraseSuccessRate(
        phrase,
        successfulOpenings,
        failedOpenings
      );

      // Only include phrases with >60% success rate
      if (successRate > 0.6) {
        // Calculate additional metrics
        const callsWithPhrase = [...successfulOpenings, ...failedOpenings]
          .filter(o => o.transcript && o.transcript.toLowerCase().includes(phrase));

        const avgDuration = callsWithPhrase.reduce((sum, o) => sum + (o.duration_sec || 0), 0) /
          callsWithPhrase.length;

        const conversions = callsWithPhrase.filter(o =>
          ['SALE', 'APPOINTMENT_SET'].includes(o.disposition)
        ).length;

        patterns.push({
          phrase,
          success_rate: successRate,
          sample_count: callsWithPhrase.length,
          avg_duration: avgDuration,
          conversion_rate: conversions / callsWithPhrase.length
        });
      }
    }

    // Sort by success rate
    patterns.sort((a, b) => b.success_rate - a.success_rate);

    // Store top patterns in database
    for (const pattern of patterns.slice(0, 20)) {
      await storeDiscoveredPattern(pattern, successfulOpenings);
    }

    // Generate insights
    const insights = generateInsights(patterns, successfulOpenings, failedOpenings);

    // Generate recommendations
    const recommendations = generateRecommendations(patterns, successfulOpenings, failedOpenings);

    logInfo({
      event_type: 'pattern_discovery_complete',
      patterns_found: patterns.length,
      top_success_rate: patterns[0]?.success_rate || 0
    });

    return {
      patterns: patterns.slice(0, 50), // Return top 50
      insights,
      recommendations
    };

  } catch (error: any) {
    logError('Pattern discovery failed', error);
    throw error;
  }
}

/**
 * Store discovered pattern in database
 */
async function storeDiscoveredPattern(pattern: OpeningPattern, examples: any[]): Promise<void> {
  try {
    // Find best example of this pattern
    const example = examples.find(o =>
      o.transcript && o.transcript.toLowerCase().includes(pattern.phrase)
    );

    // Check if pattern already exists
    const existing = await db.oneOrNone(`
      SELECT id FROM opening_patterns
      WHERE $1 = ANY(key_phrases)
    `, [pattern.phrase]);

    if (existing) {
      // Update existing pattern
      await db.none(`
        UPDATE opening_patterns
        SET
          sample_count = $2,
          success_rate = $3,
          avg_duration_sec = $4,
          conversion_rate = $5,
          updated_at = NOW()
        WHERE id = $1
      `, [
        existing.id,
        pattern.sample_count,
        pattern.success_rate,
        pattern.avg_duration,
        pattern.conversion_rate
      ]);
    } else {
      // Create new pattern
      await db.none(`
        INSERT INTO opening_patterns (
          pattern_name,
          pattern_type,
          example_transcript,
          key_phrases,
          sample_count,
          success_rate,
          continuation_rate,
          avg_duration_sec,
          conversion_rate,
          confidence_score
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        `Pattern_${pattern.phrase.substring(0, 20)}`,
        detectPatternType(pattern.phrase),
        example?.transcript || pattern.phrase,
        [pattern.phrase],
        pattern.sample_count,
        pattern.success_rate,
        pattern.success_rate, // Using success rate as proxy for continuation
        pattern.avg_duration,
        pattern.conversion_rate,
        calculateConfidence(pattern.sample_count)
      ]);
    }
  } catch (error: any) {
    logError('Failed to store pattern', error, { phrase: pattern.phrase });
  }
}

/**
 * Detect pattern type from phrase
 */
function detectPatternType(phrase: string): string {
  const lower = phrase.toLowerCase();

  if (lower.includes('hello') || lower.includes('hi') || lower.includes('good')) {
    return 'greeting';
  }
  if (lower.includes('calling from') || lower.includes('my name') || lower.includes('this is')) {
    return 'introduction';
  }
  if (lower.includes('help') || lower.includes('offer') || lower.includes('opportunity')) {
    return 'hook';
  }

  return 'full_opening';
}

/**
 * Calculate statistical confidence based on sample size
 */
function calculateConfidence(sampleSize: number): number {
  if (sampleSize < 10) return 0.3;
  if (sampleSize < 30) return 0.5;
  if (sampleSize < 100) return 0.7;
  if (sampleSize < 500) return 0.9;
  return 0.95;
}

/**
 * Generate insights from pattern analysis
 */
function generateInsights(
  patterns: OpeningPattern[],
  successful: any[],
  failed: any[]
): string[] {
  const insights: string[] = [];

  // Pace insights
  const avgSuccessPace = successful.reduce((sum, o) => sum + (o.pace_wpm || 0), 0) / successful.length;
  const avgFailPace = failed.reduce((sum, o) => sum + (o.pace_wpm || 0), 0) / failed.length;

  if (avgSuccessPace > avgFailPace * 1.1) {
    insights.push(`Successful openings are ${Math.round((avgSuccessPace / avgFailPace - 1) * 100)}% faster paced`);
  }

  // Question insights
  const successWithQuestions = successful.filter(o => o.question_asked).length / successful.length;
  const failWithQuestions = failed.filter(o => o.question_asked).length / failed.length;

  if (successWithQuestions > failWithQuestions * 1.5) {
    insights.push(`Asking questions increases success rate by ${Math.round((successWithQuestions / failWithQuestions - 1) * 100)}%`);
  }

  // Greeting insights
  const greetingTypes = new Map<string, { success: number; total: number }>();
  [...successful, ...failed].forEach(o => {
    if (!o.greeting_type) return;
    const current = greetingTypes.get(o.greeting_type) || { success: 0, total: 0 };
    current.total++;
    if (o.call_continued) current.success++;
    greetingTypes.set(o.greeting_type, current);
  });

  let bestGreeting = '';
  let bestRate = 0;
  for (const [greeting, stats] of greetingTypes) {
    const rate = stats.success / stats.total;
    if (rate > bestRate) {
      bestRate = rate;
      bestGreeting = greeting;
    }
  }

  if (bestGreeting) {
    insights.push(`"${bestGreeting}" greeting has the highest success rate at ${Math.round(bestRate * 100)}%`);
  }

  // Top pattern insight
  if (patterns.length > 0) {
    insights.push(`Top phrase "${patterns[0].phrase}" has ${Math.round(patterns[0].success_rate * 100)}% success rate`);
  }

  return insights;
}

/**
 * Generate actionable recommendations
 */
function generateRecommendations(
  patterns: OpeningPattern[],
  successful: any[],
  failed: any[]
): string[] {
  const recommendations: string[] = [];

  // Pace recommendation
  const optimalPace = successful
    .filter(o => o.disposition === 'SALE')
    .reduce((sum, o) => sum + (o.pace_wpm || 0), 0) /
    successful.filter(o => o.disposition === 'SALE').length;

  if (optimalPace > 0) {
    recommendations.push(`Aim for ${Math.round(optimalPace)} words per minute in opening`);
  }

  // Pattern recommendations
  if (patterns.length > 0) {
    const topPhrases = patterns.slice(0, 3).map(p => `"${p.phrase}"`).join(', ');
    recommendations.push(`Use these proven phrases: ${topPhrases}`);
  }

  // Question recommendation
  const questionSuccess = successful.filter(o => o.question_asked).length / successful.length;
  if (questionSuccess > 0.6) {
    recommendations.push('Include an engaging question in your opening');
  }

  // Company mention
  const companySuccess = successful.filter(o => o.company_mentioned).length / successful.length;
  if (companySuccess > 0.7) {
    recommendations.push('Always mention company name in opening');
  }

  // Value prop
  const valueSuccess = successful.filter(o => o.value_prop_mentioned).length / successful.length;
  if (valueSuccess > 0.5) {
    recommendations.push('Include value proposition early in the conversation');
  }

  return recommendations;
}

/**
 * Score an opening in real-time
 */
export async function scoreOpening(transcript: string, duration?: number): Promise<{
  score: number;
  continuationProbability: number;
  matchedPatterns: string[];
  recommendations: string[];
}> {
  try {
    // Get successful patterns from database
    const patterns = await db.manyOrNone(`
      SELECT * FROM opening_patterns
      WHERE success_rate > 0.6
      ORDER BY success_rate DESC
      LIMIT 20
    `);

    let score = 0;
    const matchedPatterns: string[] = [];

    // Check for pattern matches
    for (const pattern of patterns) {
      if (pattern.key_phrases && Array.isArray(pattern.key_phrases)) {
        for (const phrase of pattern.key_phrases) {
          if (transcript.toLowerCase().includes(phrase.toLowerCase())) {
            score += pattern.success_rate * 20;
            matchedPatterns.push(phrase);
          }
        }
      }
    }

    // Normalize score
    score = Math.min(score, 100);

    // Calculate continuation probability
    const continuationProbability = score / 100;

    // Generate recommendations
    const recommendations: string[] = [];
    if (continuationProbability < 0.5) {
      recommendations.push('High risk of early hangup - adjust approach');
      recommendations.push('Consider using proven opening phrases');
    } else if (continuationProbability < 0.7) {
      recommendations.push('Moderate engagement expected - stay focused');
    } else {
      recommendations.push('Strong opening - continue current approach');
    }

    return {
      score,
      continuationProbability,
      matchedPatterns,
      recommendations
    };

  } catch (error: any) {
    logError('Failed to score opening', error);
    return {
      score: 50,
      continuationProbability: 0.5,
      matchedPatterns: [],
      recommendations: ['Unable to score - using default values']
    };
  }
}

/**
 * Get agent performance on openings
 */
export async function getAgentOpeningPerformance(agentName: string, days: number = 30): Promise<any> {
  const result = await db.oneOrNone(`
    SELECT
      COUNT(*) as total_calls,
      AVG(success_score) as avg_success_score,
      AVG(engagement_score) as avg_engagement_score,
      SUM(CASE WHEN call_continued THEN 1 ELSE 0 END)::FLOAT / COUNT(*) as continuation_rate,
      SUM(CASE WHEN disposition IN ('SALE', 'APPOINTMENT_SET') THEN 1 ELSE 0 END)::FLOAT / COUNT(*) as conversion_rate
    FROM opening_segments
    WHERE agent_name = $1
    AND created_at > NOW() - INTERVAL '${days} days'
  `, [agentName]);

  return result;
}