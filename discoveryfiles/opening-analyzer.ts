/**
 * Opening Pattern Analyzer - Production Ready
 * Discovers successful patterns from YOUR real call data
 */

import { db } from '@/server/db';
import { logInfo, logError } from '@/lib/log';

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