import { db } from '../db';

interface RetentionPolicy {
  transcriptDays: number;
  analysisDays: number;
  eventDays: number;
  audioUrlDays: number;
  piiMaskingEnabled: boolean;
}

const DEFAULT_POLICY: RetentionPolicy = {
  transcriptDays: 90,    // Keep transcripts for 90 days
  analysisDays: 180,     // Keep analyses for 180 days
  eventDays: 30,         // Keep events for 30 days
  audioUrlDays: 7,       // Clear audio URLs after 7 days
  piiMaskingEnabled: true
};

/**
 * Mask PII in text
 */
export function maskPII(text: string): string {
  if (!text) return text;
  
  // Phone numbers (various formats)
  text = text.replace(/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g, '[PHONE]');
  text = text.replace(/\b\d{10}\b/g, '[PHONE]');
  text = text.replace(/\(\d{3}\)\s?\d{3}-\d{4}/g, '[PHONE]');
  
  // SSN
  text = text.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN]');
  
  // Credit card numbers
  text = text.replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '[CARD]');
  text = text.replace(/\b\d{15,16}\b/g, '[CARD]');
  
  // Email addresses
  text = text.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]');
  
  // Bank account numbers (basic pattern)
  text = text.replace(/\b\d{8,17}\b/g, (match) => {
    // Only mask if it looks like an account number (not a phone)
    if (match.length > 10) return '[ACCOUNT]';
    return match;
  });
  
  // Date of birth patterns
  text = text.replace(/\b(0[1-9]|1[0-2])[\/\-](0[1-9]|[12]\d|3[01])[\/\-](19|20)\d{2}\b/g, '[DOB]');
  
  // Driver's license (basic pattern - varies by state)
  text = text.replace(/\b[A-Z]\d{7,12}\b/g, '[DL]');
  
  // Addresses (simplified - street numbers and zip codes)
  text = text.replace(/\b\d{5}(-\d{4})?\b/g, '[ZIP]');
  
  return text;
}

/**
 * Apply data retention policy
 */
export async function applyRetentionPolicy(
  policy: RetentionPolicy = DEFAULT_POLICY
): Promise<{
  transcriptsMasked: number;
  transcriptsDeleted: number;
  analysesDeleted: number;
  eventsDeleted: number;
  audioUrlsCleared: number;
}> {
  const results = {
    transcriptsMasked: 0,
    transcriptsDeleted: 0,
    analysesDeleted: 0,
    eventsDeleted: 0,
    audioUrlsCleared: 0
  };

  try {
    // 1. Mask PII in old transcripts (30-90 days old)
    if (policy.piiMaskingEnabled) {
      const maskCutoff = new Date();
      maskCutoff.setDate(maskCutoff.getDate() - 30);
      
      const transcriptsToMask = await db.manyOrNone(`
        SELECT t.id, t.text, t.translated_text
        FROM transcripts t
        JOIN calls c ON c.id = t.call_id
        WHERE c.started_at < $1
          AND t.pii_masked = false
          AND t.text IS NOT NULL
        LIMIT 100
      `, [maskCutoff]);

      for (const transcript of transcriptsToMask) {
        const maskedText = maskPII(transcript.text);
        const maskedTranslated = transcript.translated_text ? maskPII(transcript.translated_text) : null;
        
        await db.none(`
          UPDATE transcripts
          SET text = $2,
              translated_text = $3,
              pii_masked = true,
              pii_masked_at = now()
          WHERE id = $1
        `, [transcript.id, maskedText, maskedTranslated]);
        
        results.transcriptsMasked++;
      }
    }

    // 2. Delete old transcripts
    if (policy.transcriptDays > 0) {
      const transcriptCutoff = new Date();
      transcriptCutoff.setDate(transcriptCutoff.getDate() - policy.transcriptDays);
      
      const deleted = await db.result(`
        DELETE FROM transcripts
        WHERE call_id IN (
          SELECT id FROM calls 
          WHERE started_at < $1
        )
      `, [transcriptCutoff]);
      
      results.transcriptsDeleted = deleted.rowCount;
    }

    // 3. Delete old analyses
    if (policy.analysisDays > 0) {
      const analysisCutoff = new Date();
      analysisCutoff.setDate(analysisCutoff.getDate() - policy.analysisDays);
      
      const deleted = await db.result(`
        DELETE FROM analyses
        WHERE call_id IN (
          SELECT id FROM calls 
          WHERE started_at < $1
        )
      `, [analysisCutoff]);
      
      results.analysesDeleted = deleted.rowCount;
    }

    // 4. Delete old events
    if (policy.eventDays > 0) {
      const eventCutoff = new Date();
      eventCutoff.setDate(eventCutoff.getDate() - policy.eventDays);
      
      const deleted = await db.result(`
        DELETE FROM call_events
        WHERE created_at < $1
      `, [eventCutoff]);
      
      results.eventsDeleted = deleted.rowCount;
    }

    // 5. Clear audio URLs
    if (policy.audioUrlDays > 0) {
      const audioCutoff = new Date();
      audioCutoff.setDate(audioCutoff.getDate() - policy.audioUrlDays);
      
      const cleared = await db.result(`
        UPDATE calls
        SET convoso_audio_url = NULL,
            audio_url_cleared = true,
            audio_url_cleared_at = now()
        WHERE started_at < $1
          AND convoso_audio_url IS NOT NULL
      `, [audioCutoff]);
      
      results.audioUrlsCleared = cleared.rowCount;
    }

    // Log retention action
    await db.none(`
      INSERT INTO call_events(call_id, type, payload)
      VALUES('SYSTEM', 'retention_applied', $1)
    `, [results]);

    return results;

  } catch (error) {
    console.error('[Retention] Error applying policy:', error);
    throw error;
  }
}

/**
 * Export data for a specific call (before deletion)
 */
export async function exportCallData(callId: string): Promise<any> {
  try {
    const call = await db.oneOrNone(`
      SELECT * FROM calls WHERE id = $1
    `, [callId]);

    if (!call) {
      throw new Error('Call not found');
    }

    const transcript = await db.oneOrNone(`
      SELECT * FROM transcripts WHERE call_id = $1
    `, [callId]);

    const analysis = await db.oneOrNone(`
      SELECT * FROM analyses WHERE call_id = $1
    `, [callId]);

    const events = await db.manyOrNone(`
      SELECT * FROM call_events 
      WHERE call_id = $1
      ORDER BY created_at DESC
    `, [callId]);

    return {
      call,
      transcript,
      analysis,
      events,
      exported_at: new Date().toISOString()
    };

  } catch (error) {
    console.error('[Retention] Error exporting call data:', error);
    throw error;
  }
}

/**
 * Anonymize a specific call
 */
export async function anonymizeCall(callId: string): Promise<void> {
  try {
    // Anonymize call record
    await db.none(`
      UPDATE calls
      SET customer_phone = 'REDACTED',
          agent_name = 'AGENT_' || SUBSTRING(id, 1, 8),
          convoso_audio_url = NULL,
          anonymized = true,
          anonymized_at = now()
      WHERE id = $1
    `, [callId]);

    // Mask transcript
    const transcript = await db.oneOrNone(`
      SELECT id, text, translated_text 
      FROM transcripts 
      WHERE call_id = $1
    `, [callId]);

    if (transcript) {
      const maskedText = maskPII(transcript.text);
      const maskedTranslated = transcript.translated_text ? maskPII(transcript.translated_text) : null;
      
      await db.none(`
        UPDATE transcripts
        SET text = $2,
            translated_text = $3,
            pii_masked = true,
            pii_masked_at = now()
        WHERE id = $1
      `, [transcript.id, maskedText, maskedTranslated]);
    }

    // Log anonymization
    await db.none(`
      INSERT INTO call_events(call_id, type, payload)
      VALUES($1, 'anonymized', $2)
    `, [callId, { timestamp: new Date().toISOString() }]);

  } catch (error) {
    console.error('[Retention] Error anonymizing call:', error);
    throw error;
  }
}

/**
 * Get retention statistics
 */
export async function getRetentionStats(): Promise<any> {
  try {
    const stats = await db.one(`
      SELECT 
        COUNT(*) as total_calls,
        COUNT(CASE WHEN anonymized = true THEN 1 END) as anonymized_calls,
        COUNT(CASE WHEN audio_url_cleared = true THEN 1 END) as cleared_audio_urls,
        (SELECT COUNT(*) FROM transcripts WHERE pii_masked = true) as masked_transcripts,
        (SELECT MIN(started_at) FROM calls) as oldest_call,
        (SELECT MAX(started_at) FROM calls) as newest_call
    `);

    const ageBreakdown = await db.manyOrNone(`
      SELECT 
        CASE 
          WHEN started_at > NOW() - INTERVAL '7 days' THEN '0-7 days'
          WHEN started_at > NOW() - INTERVAL '30 days' THEN '8-30 days'
          WHEN started_at > NOW() - INTERVAL '90 days' THEN '31-90 days'
          WHEN started_at > NOW() - INTERVAL '180 days' THEN '91-180 days'
          ELSE '180+ days'
        END as age_bucket,
        COUNT(*) as count
      FROM calls
      GROUP BY age_bucket
      ORDER BY age_bucket
    `);

    return {
      ...stats,
      age_breakdown: ageBreakdown
    };

  } catch (error) {
    console.error('[Retention] Error getting stats:', error);
    throw error;
  }
}