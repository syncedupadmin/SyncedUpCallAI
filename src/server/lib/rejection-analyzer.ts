import { db } from '@/server/db';
import { logInfo, logError } from '@/lib/log';

// Call tier definitions based on duration
export const CALL_TIERS = {
  IMMEDIATE_REJECTION: { min: 3, max: 15, name: 'immediate_rejection' },
  SHORT_REJECTION: { min: 15, max: 30, name: 'short_rejection' },
  PITCHED_AFTER_REJECTION: { min: 30, max: 120, name: 'pitched_after_rejection' },
  FULL_CONVERSATION: { min: 120, max: null, name: 'full_conversation' }
} as const;

// Rejection type patterns
const REJECTION_PATTERNS = {
  not_interested: /not interested|don't want|no thanks|not for me/i,
  no_time: /don't have time|busy|call.*later|bad time|middle of/i,
  already_have: /already have|got one|covered|have insurance|don't need/i,
  spam_fear: /stop calling|take me off|remove.*list|how did you get|don't call/i,
  hostile: /fuck off|leave.*alone|harassment|stop bothering|hung up on/i,
  spouse_decision: /talk.*spouse|wife|husband|partner.*decide/i,
  too_good: /scam|too good|sounds fake|don't believe/i,
  price_concern: /can't afford|too expensive|no money|tight budget/i
};

// Rebuttal quality indicators
const REBUTTAL_INDICATORS = {
  empathy: /understand|appreciate|hear you|makes sense|totally get/i,
  value_prop: /save|benefit|help|protect|coverage|peace of mind/i,
  permission: /just.*quick|30 seconds|brief moment|real quick/i,
  question: /may I ask|curious|wondering|mind if/i,
  humor: /haha|funny|laugh|joke/i,
  persistence: /before you go|wait|hold on|one thing/i
};

interface CallData {
  id: string;
  duration_sec: number;
  transcript?: string;
  diarized?: any;
  agent_id?: string;
  agent_name?: string;
  campaign?: string;
  disposition?: string;
}

interface RejectionAnalysisResult {
  call_tier: string;
  call_category: string;
  opening_delivered: string;
  rejection_detected: boolean;
  rejection_type?: string;
  rejection_severity?: string;
  rebuttal_attempted: boolean;
  rebuttal_quality_score?: number;
  professionalism_score: number;
  script_compliance_score: number;
  led_to_pitch: boolean;
  rebuttal_to_outcome?: string;
  coaching_notes: string[];
  missed_opportunities: string[];
}

export function detectCallTier(duration_sec: number): string {
  if (duration_sec < CALL_TIERS.IMMEDIATE_REJECTION.max) {
    return CALL_TIERS.IMMEDIATE_REJECTION.name;
  } else if (duration_sec < CALL_TIERS.SHORT_REJECTION.max) {
    return CALL_TIERS.SHORT_REJECTION.name;
  } else if (duration_sec < CALL_TIERS.PITCHED_AFTER_REJECTION.max) {
    return CALL_TIERS.PITCHED_AFTER_REJECTION.name;
  } else {
    return CALL_TIERS.FULL_CONVERSATION.name;
  }
}

export function detectRejectionType(transcript: string): { type: string; severity: string } | null {
  const lower = transcript.toLowerCase();

  // Check hostile first (highest severity)
  if (REJECTION_PATTERNS.hostile.test(lower)) {
    return { type: 'hostile', severity: 'hostile' };
  }

  // Check other patterns
  for (const [type, pattern] of Object.entries(REJECTION_PATTERNS)) {
    if (type !== 'hostile' && pattern.test(lower)) {
      // Determine severity based on language intensity
      let severity = 'mild';
      if (/never|absolutely|definitely|stop/i.test(lower)) {
        severity = 'severe';
      } else if (/really|very|quite|pretty/i.test(lower)) {
        severity = 'moderate';
      }
      return { type, severity };
    }
  }

  return null;
}

function extractSpeakerSegments(diarized: any): { agent: string[]; customer: string[] } {
  const segments = { agent: [] as string[], customer: [] as string[] };

  if (!diarized || !Array.isArray(diarized)) {
    return segments;
  }

  for (const segment of diarized) {
    const speaker = segment.speaker?.toLowerCase();
    const text = segment.text || '';

    if (speaker === 'agent' || speaker === 'a') {
      segments.agent.push(text);
    } else if (speaker === 'customer' || speaker === 'c' || speaker === 'b') {
      segments.customer.push(text);
    }
  }

  return segments;
}

function assessOpeningCompletion(transcript: string, duration_sec: number): string {
  if (!transcript) return 'none';

  const lower = transcript.toLowerCase();
  const hasGreeting = /hello|hi|hey|good\s+(morning|afternoon|evening)/i.test(lower);
  const hasName = /my name is|this is|i'm/i.test(lower);
  const hasCompany = /calling from|with|representing/i.test(lower);
  const hasPurpose = /calling about|regarding|to help|to discuss/i.test(lower);

  const components = [hasGreeting, hasName, hasCompany, hasPurpose].filter(Boolean).length;

  if (duration_sec < 5) {
    return 'none';
  } else if (components >= 3) {
    return 'complete';
  } else if (components >= 1) {
    return 'partial';
  } else {
    return 'none';
  }
}

function checkRebuttalAttempt(segments: { agent: string[]; customer: string[] }): {
  attempted: boolean;
  type?: string;
  quality: number;
  response?: string;
} {
  // Look for agent response after customer rejection
  if (segments.customer.length === 0 || segments.agent.length === 0) {
    return { attempted: false, quality: 0 };
  }

  // Find last customer segment (likely contains rejection)
  const lastCustomerIdx = segments.customer.length - 1;
  const rejection = segments.customer[lastCustomerIdx];

  // Check if agent responded after rejection
  const agentResponseAfterRejection = segments.agent[segments.agent.length - 1];

  if (!agentResponseAfterRejection || agentResponseAfterRejection.length < 10) {
    return { attempted: false, quality: 0 };
  }

  // Analyze rebuttal quality
  let quality = 30; // Base score for attempting
  let rebuttalType = 'generic';

  for (const [type, pattern] of Object.entries(REBUTTAL_INDICATORS)) {
    if (pattern.test(agentResponseAfterRejection)) {
      quality += 15;
      rebuttalType = type;
    }
  }

  // Check for key elements
  if (agentResponseAfterRejection.length > 50) quality += 10; // Substantive response
  if (/\?/.test(agentResponseAfterRejection)) quality += 10; // Asked a question
  if (!/um|uh|eh/i.test(agentResponseAfterRejection)) quality += 10; // No hesitation

  quality = Math.min(100, quality);

  return {
    attempted: true,
    type: rebuttalType,
    quality,
    response: agentResponseAfterRejection.substring(0, 500)
  };
}

function checkProfessionalism(transcript: string): number {
  let score = 100;
  const lower = transcript.toLowerCase();

  // Deductions for unprofessional behavior
  if (/damn|hell|shit|fuck/i.test(lower)) score -= 30;
  if (/whatever|fine|okay bye/i.test(lower)) score -= 20;
  if (/arguing|yelling|shouting/i.test(lower)) score -= 20;
  if (/um|uh|eh/gi.test(lower)) {
    const hesitations = lower.match(/um|uh|eh/gi)?.length || 0;
    score -= Math.min(20, hesitations * 5);
  }

  return Math.max(0, score);
}

function determineOutcome(call: CallData, rebuttalAttempted: boolean): {
  led_to_pitch: boolean;
  rebuttal_to_outcome: string;
} {
  const duration = call.duration_sec;
  const disposition = call.disposition?.toUpperCase();

  if (!rebuttalAttempted) {
    return {
      led_to_pitch: false,
      rebuttal_to_outcome: 'no_rebuttal'
    };
  }

  if (duration < 15) {
    return {
      led_to_pitch: false,
      rebuttal_to_outcome: 'immediate_hangup'
    };
  } else if (duration < 30) {
    return {
      led_to_pitch: false,
      rebuttal_to_outcome: 'continued_listening'
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

function generateCoachingNotes(analysis: Partial<RejectionAnalysisResult>): string[] {
  const notes: string[] = [];

  if (!analysis.rebuttal_attempted) {
    notes.push('Agent failed to attempt rebuttal after rejection - coach on persistence');
  }

  if (analysis.rebuttal_quality_score && analysis.rebuttal_quality_score < 50) {
    notes.push('Rebuttal quality needs improvement - practice empathy and value propositions');
  }

  if (analysis.professionalism_score < 80) {
    notes.push('Professionalism score below standard - review appropriate responses');
  }

  if (analysis.opening_delivered === 'none') {
    notes.push('Opening not delivered - ensure agent completes greeting before customer speaks');
  }

  if (analysis.rejection_severity === 'hostile' && analysis.professionalism_score > 80) {
    notes.push('Good job maintaining professionalism with hostile customer');
  }

  return notes;
}

export async function analyzeRejectionCall(call: CallData): Promise<RejectionAnalysisResult> {
  try {
    const tier = detectCallTier(call.duration_sec);
    const segments = extractSpeakerSegments(call.diarized);
    const fullTranscript = call.transcript || segments.agent.concat(segments.customer).join(' ');

    // Detect rejection
    const rejection = detectRejectionType(fullTranscript);

    // Assess opening
    const openingDelivered = assessOpeningCompletion(
      segments.agent[0] || fullTranscript.substring(0, 200),
      call.duration_sec
    );

    // Check rebuttal attempt
    const rebuttal = checkRebuttalAttempt(segments);

    // Calculate scores
    const professionalismScore = checkProfessionalism(fullTranscript);

    // Script compliance (simplified - would be more complex with actual scripts)
    let scriptComplianceScore = 50;
    if (openingDelivered === 'complete') scriptComplianceScore += 30;
    if (rebuttal.attempted && rejection) scriptComplianceScore += 20;

    // Determine outcomes
    const outcome = determineOutcome(call, rebuttal.attempted);

    // Determine call category
    let callCategory = 'normal';
    if (rejection) {
      callCategory = rebuttal.attempted ? 'rejection_handled' : 'rejection_failed';
    }

    // Build result
    const result: RejectionAnalysisResult = {
      call_tier: tier,
      call_category: callCategory,
      opening_delivered: openingDelivered,
      rejection_detected: !!rejection,
      rejection_type: rejection?.type,
      rejection_severity: rejection?.severity,
      rebuttal_attempted: rebuttal.attempted,
      rebuttal_quality_score: rebuttal.quality,
      professionalism_score: professionalismScore,
      script_compliance_score: scriptComplianceScore,
      led_to_pitch: outcome.led_to_pitch,
      rebuttal_to_outcome: outcome.rebuttal_to_outcome,
      coaching_notes: [],
      missed_opportunities: []
    };

    // Generate coaching notes
    result.coaching_notes = generateCoachingNotes(result);

    // Identify missed opportunities
    if (rejection && !rebuttal.attempted) {
      result.missed_opportunities.push('Failed to attempt rebuttal');
    }
    if (tier === 'immediate_rejection' && openingDelivered !== 'complete') {
      result.missed_opportunities.push('Opening too slow - customer rejected before completion');
    }

    return result;
  } catch (error) {
    logError('Rejection analysis failed', error, { call_id: call.id });
    throw error;
  }
}

export async function saveRejectionAnalysis(
  callId: string,
  analysis: RejectionAnalysisResult,
  callData: CallData
): Promise<void> {
  try {
    await db.none(`
      INSERT INTO rejection_analysis (
        call_id, call_duration_sec, call_tier, call_category,
        opening_delivered, opening_score, rejection_detected,
        rejection_type, rejection_severity, rebuttal_attempted,
        rebuttal_quality_score, professionalism_score,
        script_compliance_score, led_to_pitch, rebuttal_to_outcome,
        final_disposition, agent_id, agent_name, campaign,
        coaching_notes, missed_opportunities
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
        $15, $16, $17, $18, $19, $20, $21
      )
      ON CONFLICT (call_id) DO UPDATE SET
        call_duration_sec = $2, call_tier = $3, call_category = $4,
        opening_delivered = $5, opening_score = $6, rejection_detected = $7,
        rejection_type = $8, rejection_severity = $9, rebuttal_attempted = $10,
        rebuttal_quality_score = $11, professionalism_score = $12,
        script_compliance_score = $13, led_to_pitch = $14, rebuttal_to_outcome = $15,
        final_disposition = $16, coaching_notes = $20, missed_opportunities = $21,
        updated_at = NOW()
    `, [
      callId,
      callData.duration_sec,
      analysis.call_tier,
      analysis.call_category,
      analysis.opening_delivered,
      analysis.script_compliance_score,
      analysis.rejection_detected,
      analysis.rejection_type,
      analysis.rejection_severity,
      analysis.rebuttal_attempted,
      analysis.rebuttal_quality_score,
      analysis.professionalism_score,
      analysis.script_compliance_score,
      analysis.led_to_pitch,
      analysis.rebuttal_to_outcome,
      callData.disposition,
      callData.agent_id,
      callData.agent_name,
      callData.campaign,
      analysis.coaching_notes,
      analysis.missed_opportunities
    ]);

    logInfo({
      event_type: 'rejection_analysis_saved',
      call_id: callId,
      tier: analysis.call_tier,
      category: analysis.call_category,
      rejection_detected: analysis.rejection_detected,
      rebuttal_attempted: analysis.rebuttal_attempted,
      led_to_pitch: analysis.led_to_pitch
    });
  } catch (error) {
    logError('Failed to save rejection analysis', error, { call_id: callId });
    throw error;
  }
}

// Special prompt for short rejection calls
export const REJECTION_ANALYSIS_PROMPT = `
Analyze this SHORT REJECTION CALL with extreme focus on agent performance.

CRITICAL EVALUATION POINTS:
1. OPENING DELIVERED: Did agent complete their opening? (yes/no/partial)
   - Full greeting with name
   - Company mentioned
   - Purpose stated
   - Permission asked

2. REJECTION RESPONSE: How did agent handle the rejection?
   - Did they attempt ANY rebuttal? (yes/no)
   - Was the rebuttal professional?
   - Did they show empathy?
   - Did they persist appropriately?

3. PROFESSIONALISM: Throughout the rejection
   - Stayed calm and professional? (0-100)
   - No arguing or frustration?
   - Appropriate tone maintained?

4. SCRIPT COMPLIANCE: Even in rejection
   - Used required phrases?
   - Followed rebuttal protocol?
   - Attempted to overcome objection?

IMPORTANT: Grade the agent on what they ATTEMPTED, not the outcome.
Even if customer says "fuck off" in 2 seconds, evaluate:
- How quickly agent delivered opening
- Whether they attempted trained rebuttal
- If they maintained composure

Return structured assessment focusing on AGENT PERFORMANCE, not customer behavior.
`;

export async function updateAgentRejectionMetrics(
  agentId: string,
  agentName: string,
  date: Date = new Date()
): Promise<void> {
  try {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    // Calculate metrics for the agent for this period
    const metrics = await db.one(`
      SELECT
        COUNT(*) as total_rejections,
        COUNT(*) FILTER (WHERE call_tier = 'immediate_rejection') as rejections_immediate,
        COUNT(*) FILTER (WHERE call_tier = 'short_rejection') as rejections_short,
        COUNT(*) FILTER (WHERE rebuttal_attempted = true) as rebuttals_attempted,
        COUNT(*) FILTER (WHERE led_to_pitch = true) as pitched_after_rejection,
        COUNT(*) FILTER (WHERE rebuttal_to_outcome = 'sale') as sales_after_rejection,
        AVG(professionalism_score) as avg_professionalism_score,
        AVG(rebuttal_quality_score) as avg_rebuttal_quality_score,
        AVG(script_compliance_score) as avg_script_compliance_score
      FROM rejection_analysis
      WHERE agent_id = $1
      AND created_at >= $2
      AND created_at <= $3
      AND rejection_detected = true
    `, [agentId, startOfDay, endOfDay]);

    // Calculate rates
    const rebuttalAttemptRate = metrics.total_rejections > 0
      ? metrics.rebuttals_attempted / metrics.total_rejections
      : 0;

    const pitchAchievementRate = metrics.rebuttals_attempted > 0
      ? metrics.pitched_after_rejection / metrics.rebuttals_attempted
      : 0;

    const rejectionToSaleRate = metrics.total_rejections > 0
      ? metrics.sales_after_rejection / metrics.total_rejections
      : 0;

    // Upsert agent performance record
    await db.none(`
      INSERT INTO agent_rejection_performance (
        agent_id, agent_name, period_start, period_end,
        total_rejections, rejections_immediate, rejections_short,
        rebuttals_attempted, rebuttal_attempt_rate,
        pitched_after_rejection, pitch_achievement_rate,
        sales_after_rejection, rejection_to_sale_rate,
        avg_professionalism_score, avg_rebuttal_quality_score,
        avg_script_compliance_score
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
      )
      ON CONFLICT (agent_id, period_start, period_end) DO UPDATE SET
        total_rejections = $5,
        rejections_immediate = $6,
        rejections_short = $7,
        rebuttals_attempted = $8,
        rebuttal_attempt_rate = $9,
        pitched_after_rejection = $10,
        pitch_achievement_rate = $11,
        sales_after_rejection = $12,
        rejection_to_sale_rate = $13,
        avg_professionalism_score = $14,
        avg_rebuttal_quality_score = $15,
        avg_script_compliance_score = $16,
        updated_at = NOW()
    `, [
      agentId, agentName, startOfDay, endOfDay,
      metrics.total_rejections,
      metrics.rejections_immediate,
      metrics.rejections_short,
      metrics.rebuttals_attempted,
      rebuttalAttemptRate,
      metrics.pitched_after_rejection,
      pitchAchievementRate,
      metrics.sales_after_rejection,
      rejectionToSaleRate,
      metrics.avg_professionalism_score,
      metrics.avg_rebuttal_quality_score,
      metrics.avg_script_compliance_score
    ]);

    logInfo({
      event_type: 'agent_rejection_metrics_updated',
      agent_id: agentId,
      agent_name: agentName,
      date: startOfDay,
      metrics: {
        total_rejections: metrics.total_rejections,
        rebuttal_attempt_rate: rebuttalAttemptRate,
        rejection_to_sale_rate: rejectionToSaleRate
      }
    });
  } catch (error) {
    logError('Failed to update agent rejection metrics', error, { agent_id: agentId });
    throw error;
  }
}