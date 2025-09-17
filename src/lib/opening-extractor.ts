/**
 * Opening Extractor - Production Ready
 * Extracts and analyzes call openings from real recordings
 */

import { db } from '@/src/server/db';
import { logInfo, logError } from '@/src/lib/log';

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
}

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

    logInfo({
      event_type: 'opening_extracted',
      call_id: callId,
      opening_id: result.id,
      pace_wpm,
      silence_ratio,
      call_continued,
      disposition: call.disposition,
      success_score,
      engagement_score
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
        engagement_score
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