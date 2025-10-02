/**
 * Post Close Compliance Analysis
 * Verifies agents read required terms & conditions scripts verbatim after card collection
 */

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

interface PostCloseScript {
  id: string;
  script_name: string;
  script_version: string;
  product_type?: string;
  state?: string;
  script_text: string;
  required_phrases: string[];
  optional_phrases: string[];
  phrase_sequence?: any;
  min_word_match_percentage: number;
  fuzzy_match_threshold: number;
  allow_minor_variations: boolean;
  strict_mode: boolean;
  active: boolean;
}

interface PostCloseSegment {
  id: string;
  call_id: string;
  start_ms: number;
  end_ms: number;
  duration_sec: number;
  transcript: string;
  words?: any;
  card_collection_timestamp_ms?: number;
  agent_name?: string;
}

interface ComplianceResult {
  overall_score: number;
  compliance_passed: boolean;
  word_match_percentage: number;
  phrase_match_percentage: number;
  sequence_score: number;
  missing_phrases: string[];
  paraphrased_sections: ParaphrasedSection[];
  sequence_errors: any[];
  extra_content: string[];
  levenshtein_distance: number;
  similarity_score: number;
  flagged_for_review: boolean;
  flag_reasons: string[];
}

interface ParaphrasedSection {
  original: string;
  actual: string;
  similarity: number;
  position: number;
}

// ============================================
// LEVENSHTEIN DISTANCE (Fuzzy Matching)
// ============================================

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,    // deletion
          dp[i][j - 1] + 1,    // insertion
          dp[i - 1][j - 1] + 1 // substitution
        );
      }
    }
  }

  return dp[m][n];
}

/**
 * Calculate similarity score (0-1) from Levenshtein distance
 */
function calculateSimilarity(str1: string, str2: string): number {
  const distance = levenshteinDistance(str1.toLowerCase(), str2.toLowerCase());
  const maxLength = Math.max(str1.length, str2.length);
  return maxLength === 0 ? 1 : 1 - (distance / maxLength);
}

// ============================================
// TEXT NORMALIZATION
// ============================================

/**
 * Normalize text for comparison (remove extra spaces, punctuation, lowercase)
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ') // Replace punctuation with space
    .replace(/\s+/g, ' ')     // Collapse multiple spaces
    .trim();
}

/**
 * Split text into words
 */
function splitIntoWords(text: string): string[] {
  return normalizeText(text).split(' ').filter(w => w.length > 0);
}

// ============================================
// PHRASE MATCHING
// ============================================

/**
 * Check if a required phrase appears in the transcript
 */
function findPhraseInTranscript(
  phrase: string,
  transcript: string,
  fuzzyThreshold: number = 0.8
): { found: boolean; similarity: number; actualText?: string; position?: number } {
  const normalizedPhrase = normalizeText(phrase);
  const normalizedTranscript = normalizeText(transcript);

  // Exact match first
  if (normalizedTranscript.includes(normalizedPhrase)) {
    return {
      found: true,
      similarity: 1.0,
      actualText: phrase,
      position: normalizedTranscript.indexOf(normalizedPhrase)
    };
  }

  // Fuzzy matching: sliding window
  const phraseWords = splitIntoWords(phrase);
  const transcriptWords = splitIntoWords(transcript);
  const windowSize = phraseWords.length;

  let bestMatch = {
    found: false,
    similarity: 0,
    actualText: undefined as string | undefined,
    position: undefined as number | undefined
  };

  for (let i = 0; i <= transcriptWords.length - windowSize; i++) {
    const window = transcriptWords.slice(i, i + windowSize).join(' ');
    const similarity = calculateSimilarity(normalizedPhrase, window);

    if (similarity >= fuzzyThreshold && similarity > bestMatch.similarity) {
      bestMatch = {
        found: true,
        similarity,
        actualText: transcriptWords.slice(i, i + windowSize).join(' '),
        position: i
      };
    }
  }

  return bestMatch;
}

/**
 * Find all required phrases in transcript
 */
function analyzeRequiredPhrases(
  requiredPhrases: string[],
  transcript: string,
  fuzzyThreshold: number
): {
  found: string[];
  missing: string[];
  paraphrased: ParaphrasedSection[];
  phraseMatchPercentage: number;
} {
  const found: string[] = [];
  const missing: string[] = [];
  const paraphrased: ParaphrasedSection[] = [];

  for (const phrase of requiredPhrases) {
    const match = findPhraseInTranscript(phrase, transcript, fuzzyThreshold);

    if (match.found) {
      found.push(phrase);

      // If similarity is not perfect, it's paraphrased
      if (match.similarity < 1.0 && match.actualText) {
        paraphrased.push({
          original: phrase,
          actual: match.actualText,
          similarity: match.similarity,
          position: match.position || 0
        });
      }
    } else {
      missing.push(phrase);
    }
  }

  const phraseMatchPercentage = requiredPhrases.length > 0
    ? (found.length / requiredPhrases.length) * 100
    : 100;

  return { found, missing, paraphrased, phraseMatchPercentage };
}

// ============================================
// WORD MATCHING
// ============================================

/**
 * Calculate word-level match percentage
 */
function calculateWordMatchPercentage(scriptText: string, transcript: string): number {
  const scriptWords = splitIntoWords(scriptText);
  const transcriptWords = splitIntoWords(transcript);

  if (scriptWords.length === 0) return 0;

  let matchedWords = 0;

  // Check how many script words appear in transcript
  const transcriptSet = new Set(transcriptWords);
  for (const word of scriptWords) {
    if (transcriptSet.has(word)) {
      matchedWords++;
    }
  }

  return (matchedWords / scriptWords.length) * 100;
}

// ============================================
// SEQUENCE ANALYSIS
// ============================================

/**
 * Analyze if phrases appear in the correct sequence
 */
function analyzeSequence(
  requiredPhrases: string[],
  transcript: string,
  fuzzyThreshold: number
): { sequenceScore: number; errors: any[] } {
  const positions: { phrase: string; position: number }[] = [];

  // Find position of each phrase
  for (const phrase of requiredPhrases) {
    const match = findPhraseInTranscript(phrase, transcript, fuzzyThreshold);
    if (match.found && match.position !== undefined) {
      positions.push({ phrase, position: match.position });
    }
  }

  if (positions.length < 2) {
    return { sequenceScore: 100, errors: [] };
  }

  // Check if positions are in ascending order
  const errors: any[] = [];
  let outOfOrder = 0;

  for (let i = 1; i < positions.length; i++) {
    if (positions[i].position < positions[i - 1].position) {
      outOfOrder++;
      errors.push({
        phrase: positions[i].phrase,
        expected_after: positions[i - 1].phrase,
        issue: 'out_of_order'
      });
    }
  }

  const sequenceScore = Math.max(0, 100 - (outOfOrder * 20));

  return { sequenceScore, errors };
}

// ============================================
// EXTRA CONTENT DETECTION
// ============================================

/**
 * Detect significant extra content not in the script
 */
function detectExtraContent(scriptText: string, transcript: string): string[] {
  const scriptWords = new Set(splitIntoWords(scriptText));
  const transcriptWords = splitIntoWords(transcript);

  const extraWords: string[] = [];
  const extraPhrases: string[] = [];

  // Find words in transcript but not in script
  for (const word of transcriptWords) {
    if (!scriptWords.has(word) && word.length > 3) {
      extraWords.push(word);
    }
  }

  // If more than 10% of words are extra, flag it
  if (extraWords.length > transcriptWords.length * 0.1) {
    extraPhrases.push(`${extraWords.length} extra words detected (${extraWords.slice(0, 5).join(', ')}...)`);
  }

  return extraPhrases;
}

// ============================================
// MAIN COMPLIANCE ANALYSIS
// ============================================

/**
 * Analyze compliance of a transcript against a script
 */
export async function analyzeCompliance(
  transcript: string,
  scriptId: string
): Promise<ComplianceResult> {
  try {
    // Get script from database
    const script = await db.oneOrNone(`
      SELECT * FROM post_close_scripts
      WHERE id = $1
    `, [scriptId]) as PostCloseScript | null;

    if (!script) {
      throw new Error('Script not found');
    }

    // Determine thresholds based on strict mode
    const fuzzyThreshold = script.strict_mode ? 1.0 : script.fuzzy_match_threshold;
    const minPassingScore = script.strict_mode ? 98 : script.min_word_match_percentage;

    // Normalize texts
    const normalizedScript = normalizeText(script.script_text);
    const normalizedTranscript = normalizeText(transcript);

    // Calculate word match percentage
    const wordMatchPercentage = calculateWordMatchPercentage(script.script_text, transcript);

    // Analyze required phrases with appropriate fuzzy threshold
    const phraseAnalysis = analyzeRequiredPhrases(
      script.required_phrases || [],
      transcript,
      fuzzyThreshold
    );

    // Analyze sequence with appropriate fuzzy threshold
    const sequenceAnalysis = analyzeSequence(
      script.required_phrases || [],
      transcript,
      fuzzyThreshold
    );

    // Detect extra content
    const extraContent = detectExtraContent(script.script_text, transcript);

    // Calculate overall Levenshtein distance
    const levDistance = levenshteinDistance(normalizedScript, normalizedTranscript);
    const similarityScore = calculateSimilarity(normalizedScript, normalizedTranscript);

    // Calculate overall score (weighted average)
    const overallScore = Math.round(
      wordMatchPercentage * 0.4 +
      phraseAnalysis.phraseMatchPercentage * 0.4 +
      sequenceAnalysis.sequenceScore * 0.1 +
      similarityScore * 100 * 0.1
    );

    // Determine pass/fail using mode-specific threshold
    const compliancePassed = overallScore >= minPassingScore;

    // Determine flagging
    const flagReasons: string[] = [];
    let flaggedForReview = false;

    if (!compliancePassed) {
      flaggedForReview = true;
      flagReasons.push(script.strict_mode
        ? 'Score below strict mode threshold (98%)'
        : 'Score below threshold'
      );
    }

    if (phraseAnalysis.missing.length > 0) {
      flaggedForReview = true;
      flagReasons.push(`Missing ${phraseAnalysis.missing.length} required phrases`);
    }

    // In strict mode, flag ANY paraphrasing. In normal mode, flag excessive paraphrasing
    if (script.strict_mode && phraseAnalysis.paraphrased.length > 0) {
      flaggedForReview = true;
      flagReasons.push('Paraphrasing detected (strict mode requires exact wording)');
    } else if (!script.strict_mode && phraseAnalysis.paraphrased.length > 3) {
      flaggedForReview = true;
      flagReasons.push('Excessive paraphrasing');
    }

    if (extraContent.length > 0) {
      flagReasons.push('Extra content detected');
    }

    if (sequenceAnalysis.errors.length > 0) {
      flagReasons.push('Phrases out of sequence');
    }

    return {
      overall_score: overallScore,
      compliance_passed: compliancePassed,
      word_match_percentage: wordMatchPercentage,
      phrase_match_percentage: phraseAnalysis.phraseMatchPercentage,
      sequence_score: sequenceAnalysis.sequenceScore,
      missing_phrases: phraseAnalysis.missing,
      paraphrased_sections: phraseAnalysis.paraphrased,
      sequence_errors: sequenceAnalysis.errors,
      extra_content: extraContent,
      levenshtein_distance: levDistance,
      similarity_score: similarityScore,
      flagged_for_review: flaggedForReview,
      flag_reasons: flagReasons
    };

  } catch (error: any) {
    logError('Compliance analysis failed', error);
    throw error;
  }
}

// ============================================
// SEGMENT EXTRACTION
// ============================================

/**
 * Extract post-close segment from a call (after card collection)
 */
export async function extractPostCloseSegment(callId: string): Promise<PostCloseSegment | null> {
  try {
    // Get call data with transcript
    const call = await db.oneOrNone(`
      SELECT
        c.id,
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

    if (!call || !call.full_transcript) {
      return null;
    }

    // Check if already extracted
    const existing = await db.oneOrNone(`
      SELECT id FROM post_close_segments WHERE call_id = $1
    `, [callId]);

    if (existing) {
      return null;
    }

    // Detect card collection timestamp
    let cardTimestamp: number | undefined;
    if (call.words && Array.isArray(call.words)) {
      const transcriptLower = call.full_transcript.toLowerCase();
      const cardPatterns = [
        /card.*number/i,
        /credit.*card/i,
        /debit.*card/i,
        /payment.*information/i,
        /\b\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\b/, // Card number pattern
        /last.*four/i,
        /expiration/i
      ];

      // Find first occurrence of card-related content
      for (const word of call.words) {
        const wordText = word.word.toLowerCase();
        if (cardPatterns.some(p => p.test(wordText))) {
          cardTimestamp = word.start;
          break;
        }
      }
    }

    // Extract segment AFTER card collection (or last 60 seconds if no card detected)
    let startMs: number;
    let endMs: number;
    let segmentWords: WordTiming[] = [];
    let segmentText = '';

    if (cardTimestamp) {
      // Extract everything after card collection
      startMs = cardTimestamp;
      endMs = call.duration_sec * 1000;

      if (call.words && Array.isArray(call.words)) {
        segmentWords = call.words.filter((w: any) => w.start >= startMs);
        segmentText = segmentWords.map(w => w.word).join(' ');
      }
    } else {
      // Fallback: last 60 seconds
      const totalDurationMs = call.duration_sec * 1000;
      startMs = Math.max(0, totalDurationMs - 60000);
      endMs = totalDurationMs;

      if (call.words && Array.isArray(call.words)) {
        segmentWords = call.words.filter((w: any) => w.start >= startMs && w.end <= endMs);
        segmentText = segmentWords.map(w => w.word).join(' ');
      } else {
        // Estimate from transcript
        const words = call.full_transcript.split(' ');
        const estimatedWordsIn60s = 150; // ~150 wpm
        segmentText = words.slice(-estimatedWordsIn60s).join(' ');
      }
    }

    if (!segmentText || segmentText.length < 50) {
      logInfo({
        event_type: 'post_close_extraction_skipped',
        reason: 'segment_too_short',
        call_id: callId
      });
      return null;
    }

    const durationSec = Math.round((endMs - startMs) / 1000);

    // Store in database
    const result = await db.one(`
      INSERT INTO post_close_segments (
        call_id,
        start_ms,
        end_ms,
        duration_sec,
        transcript,
        words,
        card_collection_timestamp_ms,
        sale_confirmed,
        disposition,
        agent_name,
        campaign
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      callId,
      startMs,
      endMs,
      durationSec,
      segmentText,
      JSON.stringify(segmentWords),
      cardTimestamp,
      call.disposition === 'SALE',
      call.disposition,
      call.agent_name,
      call.campaign
    ]);

    logInfo({
      event_type: 'post_close_segment_extracted',
      call_id: callId,
      segment_id: result.id,
      duration_sec: durationSec,
      card_detected: !!cardTimestamp
    });

    return result;

  } catch (error: any) {
    logError('Failed to extract post-close segment', error, { call_id: callId });
    throw error;
  }
}

/**
 * Extract segments from multiple calls in batch
 */
export async function extractSegmentsInBatch(limit: number = 100): Promise<{
  extracted: number;
  skipped: number;
  failed: number;
}> {
  const results = { extracted: 0, skipped: 0, failed: 0 };

  try {
    // Get calls that need extraction (sales with no segment yet)
    const calls = await db.manyOrNone(`
      SELECT c.id
      FROM calls c
      LEFT JOIN post_close_segments pcs ON pcs.call_id = c.id
      WHERE c.disposition = 'SALE'
      AND c.duration_sec > 60
      AND pcs.id IS NULL
      ORDER BY c.created_at DESC
      LIMIT $1
    `, [limit]);

    for (const call of calls) {
      try {
        const result = await extractPostCloseSegment(call.id);
        if (result) {
          results.extracted++;
        } else {
          results.skipped++;
        }
      } catch (error) {
        results.failed++;
      }
    }

  } catch (error: any) {
    logError('Batch extraction failed', error);
  }

  return results;
}

// ============================================
// SCRIPT MANAGEMENT
// ============================================

/**
 * Upload a new script
 */
export async function uploadScript(data: {
  script_name: string;
  script_text: string;
  product_type?: string;
  state?: string;
  required_phrases?: string[];
  uploaded_by?: string;
  strict_mode?: boolean;
  agency_id: string;
}): Promise<any> {
  try {
    // Auto-extract required phrases if not provided
    let requiredPhrases = data.required_phrases || [];

    if (requiredPhrases.length === 0) {
      // Extract sentences as required phrases
      const sentences = data.script_text
        .split(/[.!?]+/)
        .map(s => s.trim())
        .filter(s => s.length > 20);

      requiredPhrases = sentences.slice(0, 10); // Take first 10 sentences
    }

    const result = await db.one(`
      INSERT INTO post_close_scripts (
        script_name,
        script_text,
        product_type,
        state,
        required_phrases,
        uploaded_by,
        strict_mode,
        agency_id,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft')
      RETURNING *
    `, [
      data.script_name,
      data.script_text,
      data.product_type,
      data.state,
      requiredPhrases,
      data.uploaded_by,
      data.strict_mode || false,
      data.agency_id
    ]);

    logInfo({
      event_type: 'script_uploaded',
      script_id: result.id,
      script_name: data.script_name
    });

    return result;

  } catch (error: any) {
    logError('Script upload failed', error);
    throw error;
  }
}

/**
 * Get active script
 */
export async function getActiveScript(productType?: string, state?: string): Promise<PostCloseScript | null> {
  try {
    let query = 'SELECT * FROM post_close_scripts WHERE active = true';
    const params: any[] = [];

    if (productType) {
      params.push(productType);
      query += ` AND (product_type = $${params.length} OR product_type IS NULL)`;
    }

    if (state) {
      params.push(state);
      query += ` AND (state = $${params.length} OR state IS NULL)`;
    }

    query += ' ORDER BY created_at DESC LIMIT 1';

    return await db.oneOrNone(query, params);

  } catch (error: any) {
    logError('Failed to get active script', error);
    return null;
  }
}

/**
 * Activate a script
 */
export async function activateScript(scriptId: string, agencyId: string): Promise<void> {
  try {
    // Get the script to activate (ensuring it belongs to the agency)
    const script = await db.oneOrNone(`
      SELECT product_type, state FROM post_close_scripts
      WHERE id = $1 AND agency_id = $2
    `, [scriptId, agencyId]);

    if (!script) {
      throw new Error('Script not found or access denied');
    }

    // Deactivate other scripts with same product_type/state IN THIS AGENCY
    await db.none(`
      UPDATE post_close_scripts
      SET active = false
      WHERE active = true
      AND agency_id = $3
      AND (product_type = $1 OR (product_type IS NULL AND $1 IS NULL))
      AND (state = $2 OR (state IS NULL AND $2 IS NULL))
    `, [script.product_type, script.state, agencyId]);

    // Activate this script
    await db.none(`
      UPDATE post_close_scripts
      SET active = true, status = 'active'
      WHERE id = $1 AND agency_id = $2
    `, [scriptId, agencyId]);

    logInfo({
      event_type: 'script_activated',
      script_id: scriptId,
      agency_id: agencyId
    });

  } catch (error: any) {
    logError('Script activation failed', error);
    throw error;
  }
}

// ============================================
// AGENT PERFORMANCE
// ============================================

/**
 * Get agent performance for a date range
 */
export async function getAgentPerformance(
  agentName: string,
  startDate: Date,
  endDate: Date
): Promise<any> {
  try {
    const result = await db.oneOrNone(`
      SELECT
        COUNT(*) as total_analyzed,
        SUM(CASE WHEN compliance_passed THEN 1 ELSE 0 END) as total_passed,
        SUM(CASE WHEN NOT compliance_passed THEN 1 ELSE 0 END) as total_failed,
        AVG(overall_score) as avg_compliance_score,
        AVG(word_match_percentage) as avg_word_match_percentage,
        AVG(phrase_match_percentage) as avg_phrase_match_percentage,
        SUM(CASE WHEN flagged_for_review THEN 1 ELSE 0 END) as flagged_count
      FROM post_close_compliance
      WHERE agent_name = $1
      AND analyzed_at >= $2
      AND analyzed_at <= $3
    `, [agentName, startDate, endDate]);

    if (result && result.total_analyzed > 0) {
      result.pass_rate = (result.total_passed / result.total_analyzed) * 100;
    }

    return result;

  } catch (error: any) {
    logError('Failed to get agent performance', error);
    throw error;
  }
}
