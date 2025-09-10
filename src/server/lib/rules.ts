import { db } from '../db';

interface CallRiskCheck {
  callId: string;
  qaScore?: number;
  reasonPrimary?: string;
  duration?: number;
  transcript?: string;
}

interface RiskResult {
  isHighRisk: boolean;
  reason?: string;
  details?: any;
}

/**
 * Check if a call is high-risk based on multiple factors
 */
export async function isHighRisk(check: CallRiskCheck): Promise<RiskResult> {
  const reasons: string[] = [];
  
  // Check 1: Low QA Score (< 55)
  if (check.qaScore !== undefined && check.qaScore < 55) {
    reasons.push(`Low QA score: ${check.qaScore}`);
  }
  
  // Check 2: Specific reason_primary values
  const highRiskReasons = [
    'customer_escalation',
    'refund_request',
    'cancellation_request',
    'complaint',
    'legal_threat',
    'regulatory_concern'
  ];
  
  if (check.reasonPrimary && highRiskReasons.includes(check.reasonPrimary.toLowerCase())) {
    reasons.push(`High-risk reason: ${check.reasonPrimary}`);
  }
  
  // Check 3: Long calls (>= 600s) with refund/chargeback mentions
  if (check.duration && check.duration >= 600 && check.transcript) {
    const refundKeywords = [
      'refund',
      'chargeback',
      'charge back',
      'dispute',
      'money back',
      'reimbursement',
      'compensation'
    ];
    
    const transcriptLower = check.transcript.toLowerCase();
    const hasRefundMention = refundKeywords.some(keyword => transcriptLower.includes(keyword));
    
    if (hasRefundMention) {
      reasons.push(`Long call (${Math.floor(check.duration / 60)}m) with refund/chargeback mentions`);
    }
  }
  
  // Determine if high risk
  if (reasons.length > 0) {
    return {
      isHighRisk: true,
      reason: reasons.join('; '),
      details: {
        qaScore: check.qaScore,
        reasonPrimary: check.reasonPrimary,
        duration: check.duration,
        riskFactors: reasons
      }
    };
  }
  
  return { isHighRisk: false };
}

/**
 * Check if alerts are enabled for the agency
 */
export async function areAlertsEnabled(): Promise<boolean> {
  try {
    const settings = await db.oneOrNone(`
      SELECT alerts_enabled 
      FROM agency_settings 
      LIMIT 1
    `);
    
    return settings?.alerts_enabled === true;
  } catch (error) {
    console.error('[Rules] Error checking alerts enabled:', error);
    return false;
  }
}

/**
 * Process high-risk call and send alert if needed
 */
export async function processHighRiskCall(
  callId: string,
  analysis?: any
): Promise<void> {
  try {
    // Check if alerts are enabled
    const alertsEnabled = await areAlertsEnabled();
    if (!alertsEnabled) {
      console.log('[Rules] Alerts disabled, skipping high-risk check');
      return;
    }
    
    // Get call details
    const call = await db.oneOrNone(`
      SELECT 
        c.id,
        c.duration_sec,
        c.agent_name,
        c.customer_phone,
        a.qa_score,
        a.reason_primary,
        t.text as transcript
      FROM calls c
      LEFT JOIN analyses a ON a.call_id = c.id
      LEFT JOIN transcripts t ON t.call_id = c.id
      WHERE c.id = $1
    `, [callId]);
    
    if (!call) {
      console.warn('[Rules] Call not found:', callId);
      return;
    }
    
    // Check if high risk
    const riskCheck = await isHighRisk({
      callId,
      qaScore: call.qa_score,
      reasonPrimary: call.reason_primary,
      duration: call.duration_sec,
      transcript: call.transcript
    });
    
    if (riskCheck.isHighRisk) {
      console.log('[Rules] High-risk call detected:', callId, riskCheck.reason);
      
      // Import alerts module dynamically to avoid circular dependency
      const { sendHighRiskCallAlert } = await import('./alerts');
      
      // Send Slack alert
      await sendHighRiskCallAlert(callId, riskCheck.reason || 'Multiple risk factors', {
        qaScore: call.qa_score,
        reasonPrimary: call.reason_primary,
        duration: call.duration_sec,
        customerPhone: call.customer_phone,
        agentName: call.agent_name
      });
      
      // Log high-risk detection
      await db.none(`
        INSERT INTO call_events(call_id, type, payload)
        VALUES($1, 'high_risk_detected', $2)
      `, [callId, riskCheck.details]);
    }
  } catch (error) {
    console.error('[Rules] Error processing high-risk call:', error);
  }
}

/**
 * Batch check multiple calls for high risk
 */
export async function batchCheckHighRisk(callIds: string[]): Promise<Map<string, RiskResult>> {
  const results = new Map<string, RiskResult>();
  
  try {
    // Get all call details in one query
    const calls = await db.manyOrNone(`
      SELECT 
        c.id,
        c.duration_sec,
        a.qa_score,
        a.reason_primary,
        t.text as transcript
      FROM calls c
      LEFT JOIN analyses a ON a.call_id = c.id
      LEFT JOIN transcripts t ON t.call_id = c.id
      WHERE c.id = ANY($1)
    `, [callIds]);
    
    // Check each call
    for (const call of calls) {
      const result = await isHighRisk({
        callId: call.id,
        qaScore: call.qa_score,
        reasonPrimary: call.reason_primary,
        duration: call.duration_sec,
        transcript: call.transcript
      });
      
      results.set(call.id, result);
    }
  } catch (error) {
    console.error('[Rules] Error batch checking high risk:', error);
  }
  
  return results;
}

/**
 * Get high-risk calls for a time period
 */
export async function getHighRiskCalls(
  startDate?: Date,
  endDate?: Date
): Promise<any[]> {
  try {
    const dateFilter = startDate && endDate 
      ? `AND c.started_at BETWEEN $1 AND $2`
      : '';
    
    const params = startDate && endDate ? [startDate, endDate] : [];
    
    const calls = await db.manyOrNone(`
      SELECT 
        c.id,
        c.started_at,
        c.duration_sec,
        c.agent_name,
        c.customer_phone,
        a.qa_score,
        a.reason_primary,
        t.text as transcript
      FROM calls c
      LEFT JOIN analyses a ON a.call_id = c.id
      LEFT JOIN transcripts t ON t.call_id = c.id
      WHERE 1=1 ${dateFilter}
      ORDER BY c.started_at DESC
    `, params);
    
    const highRiskCalls = [];
    
    for (const call of calls) {
      const riskCheck = await isHighRisk({
        callId: call.id,
        qaScore: call.qa_score,
        reasonPrimary: call.reason_primary,
        duration: call.duration_sec,
        transcript: call.transcript
      });
      
      if (riskCheck.isHighRisk) {
        highRiskCalls.push({
          ...call,
          riskReason: riskCheck.reason,
          riskDetails: riskCheck.details
        });
      }
    }
    
    return highRiskCalls;
  } catch (error) {
    console.error('[Rules] Error getting high-risk calls:', error);
    return [];
  }
}