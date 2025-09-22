import { db } from '@/server/db';

/**
 * Convert a high-quality production call into a test case
 */
export async function createTestFromRealCall(
  callId: string,
  suiteId: string,
  options: {
    name?: string;
    category?: string;
    verifyTranscript?: boolean;  // Mark transcript as human-verified
  } = {}
): Promise<string> {
  try {
    // Get the call with all its data
    const call = await db.oneOrNone(`
      SELECT
        c.id,
        c.recording_url,
        c.duration_sec,
        c.agent_name,
        c.campaign,
        c.disposition,
        t.text as transcript,
        t.translated_text,
        t.engine as transcription_engine,
        t.lang,
        t.diarized,
        a.reason_primary,
        a.reason_secondary,
        a.confidence as analysis_confidence,
        a.qa_score,
        a.script_adherence,
        a.sentiment_agent,
        a.sentiment_customer,
        a.summary,
        cqm.classification as quality_classification,
        cqm.is_analyzable
      FROM calls c
      LEFT JOIN transcripts t ON t.call_id = c.id
      LEFT JOIN analyses a ON a.call_id = c.id
      LEFT JOIN call_quality_metrics cqm ON cqm.call_id = c.id
      WHERE c.id = $1
    `, [callId]);

    if (!call) {
      throw new Error(`Call ${callId} not found`);
    }

    if (!call.recording_url) {
      throw new Error(`Call ${callId} has no recording URL`);
    }

    // Determine test category based on call characteristics
    let testCategory = options.category;
    if (!testCategory) {
      if (call.quality_classification === 'voicemail') {
        testCategory = 'voicemail';
      } else if (call.quality_classification === 'wrong_number') {
        testCategory = 'wrong_number';
      } else if (call.quality_classification === 'dead_air') {
        testCategory = 'dead_air';
      } else if (call.duration_sec < 15) {
        testCategory = 'rejection_immediate';
      } else if (call.qa_score && call.qa_score > 85) {
        testCategory = 'clear_speech';
      } else {
        testCategory = 'multiple_speakers';
      }
    }

    // Determine difficulty based on call metrics
    let difficulty = 3; // Default medium
    if (call.qa_score) {
      if (call.qa_score > 90) difficulty = 1;
      else if (call.qa_score > 75) difficulty = 2;
      else if (call.qa_score > 50) difficulty = 3;
      else if (call.qa_score > 25) difficulty = 4;
      else difficulty = 5;
    }

    // Build expected analysis object
    const expectedAnalysis = call.reason_primary ? {
      reason_primary: call.reason_primary,
      reason_secondary: call.reason_secondary,
      qa_score: call.qa_score,
      sentiment_agent: call.sentiment_agent,
      sentiment_customer: call.sentiment_customer
    } : null;

    // Create the test case
    const testCase = await db.one(`
      INSERT INTO ai_test_cases (
        suite_id,
        name,
        audio_url,
        audio_duration_sec,
        expected_transcript,
        expected_transcript_confidence,
        expected_analysis,
        expected_classification,
        test_category,
        metadata,
        difficulty_level,
        source,
        source_call_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING id
    `, [
      suiteId,
      options.name || `Test from call ${call.id}`,
      call.recording_url,
      call.duration_sec,
      options.verifyTranscript ? call.transcript : null, // Only set if verified
      options.verifyTranscript ? 1.0 : null,
      expectedAnalysis ? JSON.stringify(expectedAnalysis) : null,
      call.quality_classification,
      testCategory,
      JSON.stringify({
        original_call_id: callId,
        agent_name: call.agent_name,
        campaign: call.campaign,
        disposition: call.disposition,
        transcription_engine: call.transcription_engine,
        language: call.lang,
        verified: options.verifyTranscript || false
      }),
      difficulty,
      'production_call',
      callId
    ]);

    console.log(`[Test Generator] Created test case ${testCase.id} from call ${callId}`);

    return testCase.id;

  } catch (error: any) {
    console.error('[Test Generator] Error creating test from real call:', error);
    throw error;
  }
}

/**
 * Generate test cases for different scenarios
 */
export async function generateTestScenarios(suiteId: string): Promise<void> {
  try {
    // Define test scenarios with expected accuracy thresholds
    const scenarios = [
      {
        name: 'Clear Speech - Simple Greeting',
        category: 'clear_speech',
        audio_url: '/test-audio/clear_greeting.mp3',
        duration: 10,
        transcript: 'Hi, this is John from ABC Insurance. How are you doing today?',
        expected_wer_threshold: 0.05,
        difficulty: 1
      },
      {
        name: 'Insurance Terminology',
        category: 'technical_terms',
        audio_url: '/test-audio/insurance_terms.mp3',
        duration: 15,
        transcript: 'Your deductible is five hundred dollars with a copay of twenty dollars for primary care visits.',
        expected_wer_threshold: 0.10,
        difficulty: 2
      },
      {
        name: 'Immediate Rejection',
        category: 'rejection_immediate',
        audio_url: '/test-audio/rejection_immediate.mp3',
        duration: 5,
        transcript: 'Not interested, take me off your list.',
        expected_classification: 'analyzable',
        expected_analysis: {
          reason_primary: 'not_interested',
          qa_score: 50
        },
        expected_wer_threshold: 0.10,
        difficulty: 2
      },
      {
        name: 'Voicemail Detection',
        category: 'voicemail',
        audio_url: '/test-audio/voicemail.mp3',
        duration: 12,
        transcript: 'Hi, you\'ve reached John Smith. I\'m not available right now. Please leave a message after the beep.',
        expected_classification: 'voicemail',
        expected_wer_threshold: 0.15,
        difficulty: 2
      },
      {
        name: 'Background Noise - Office',
        category: 'background_noise',
        audio_url: '/test-audio/office_noise.mp3',
        duration: 20,
        transcript: 'Yes, I would like to hear more about your insurance options. Can you tell me about the premium?',
        expected_wer_threshold: 0.20,
        difficulty: 3
      },
      {
        name: 'Heavy Southern Accent',
        category: 'heavy_accent',
        audio_url: '/test-audio/southern_accent.mp3',
        duration: 15,
        transcript: 'Well, I reckon I might be interested if the price is right. What\'s it gonna cost me?',
        expected_wer_threshold: 0.25,
        difficulty: 4
      },
      {
        name: 'Multiple Speakers Overlapping',
        category: 'multiple_speakers',
        audio_url: '/test-audio/multiple_speakers.mp3',
        duration: 25,
        transcript: 'Agent: So the policy covers... Customer: Wait, does that include... Agent: Yes, it includes dental.',
        expected_wer_threshold: 0.30,
        difficulty: 4
      },
      {
        name: 'Emotional Customer - Angry',
        category: 'emotional_speech',
        audio_url: '/test-audio/angry_customer.mp3',
        duration: 18,
        transcript: 'I don\'t want your insurance! Stop calling me! How did you even get my number?',
        expected_analysis: {
          reason_primary: 'spam_fear',
          sentiment_customer: 'negative',
          qa_score: 40
        },
        expected_wer_threshold: 0.20,
        difficulty: 3
      },
      {
        name: 'Fast Speech Pattern',
        category: 'fast_speech',
        audio_url: '/test-audio/fast_talker.mp3',
        duration: 10,
        transcript: 'Yeah okay so basically what I need to know is whether this covers preexisting conditions because I have diabetes.',
        expected_wer_threshold: 0.25,
        difficulty: 3
      },
      {
        name: 'Poor Phone Quality',
        category: 'phone_quality',
        audio_url: '/test-audio/poor_quality.mp3',
        duration: 15,
        transcript: 'Hello can you hear me? The connection is really bad. I said I am interested in learning more.',
        expected_wer_threshold: 0.35,
        difficulty: 5
      },
      {
        name: 'Dead Air Detection',
        category: 'dead_air',
        audio_url: '/test-audio/dead_air.mp3',
        duration: 8,
        transcript: 'Hello? ... Hello?',
        expected_classification: 'dead_air',
        expected_wer_threshold: 0.10,
        difficulty: 1
      },
      {
        name: 'Wrong Number',
        category: 'wrong_number',
        audio_url: '/test-audio/wrong_number.mp3',
        duration: 10,
        transcript: 'I think you have the wrong number. I didn\'t ask for any insurance quotes.',
        expected_classification: 'wrong_number',
        expected_analysis: {
          reason_primary: 'wrong_number'
        },
        expected_wer_threshold: 0.15,
        difficulty: 2
      }
    ];

    // Insert test scenarios
    for (const scenario of scenarios) {
      await db.none(`
        INSERT INTO ai_test_cases (
          suite_id,
          name,
          audio_url,
          audio_duration_sec,
          expected_transcript,
          expected_transcript_confidence,
          expected_analysis,
          expected_classification,
          test_category,
          metadata,
          difficulty_level,
          source
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `, [
        suiteId,
        scenario.name,
        scenario.audio_url,
        scenario.duration,
        scenario.transcript,
        1.0 - scenario.expected_wer_threshold, // Convert WER to confidence
        scenario.expected_analysis ? JSON.stringify(scenario.expected_analysis) : null,
        scenario.expected_classification || null,
        scenario.category,
        JSON.stringify({
          expected_wer_threshold: scenario.expected_wer_threshold,
          generated: true,
          scenario_type: 'baseline'
        }),
        scenario.difficulty,
        'generated'
      ]);
    }

    console.log(`[Test Generator] Generated ${scenarios.length} test scenarios for suite ${suiteId}`);

  } catch (error: any) {
    console.error('[Test Generator] Error generating test scenarios:', error);
    throw error;
  }
}

/**
 * Import high-quality calls as test cases
 */
export async function importHighQualityCalls(
  suiteId: string,
  options: {
    minQaScore?: number;
    limit?: number;
    daysBack?: number;
    campaigns?: string[];
  } = {}
): Promise<number> {
  const {
    minQaScore = 80,
    limit = 50,
    daysBack = 30,
    campaigns
  } = options;

  try {
    // Find high-quality analyzed calls
    let query = `
      SELECT c.id
      FROM calls c
      JOIN transcripts t ON t.call_id = c.id
      JOIN analyses a ON a.call_id = c.id
      LEFT JOIN call_quality_metrics cqm ON cqm.call_id = c.id
      WHERE c.recording_url IS NOT NULL
        AND c.duration_sec >= 10
        AND a.qa_score >= $1
        AND c.created_at >= NOW() - INTERVAL '%s days'
        AND cqm.is_analyzable = true
        AND NOT EXISTS (
          SELECT 1 FROM ai_test_cases tc
          WHERE tc.source_call_id = c.id
        )
    `;

    const params: any[] = [minQaScore, daysBack];

    if (campaigns && campaigns.length > 0) {
      query += ` AND c.campaign = ANY($${params.length + 1})`;
      params.push(campaigns);
    }

    query += ` ORDER BY a.qa_score DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const calls = await db.manyOrNone(query, params);

    let imported = 0;
    for (const call of calls) {
      try {
        await createTestFromRealCall(call.id, suiteId, {
          name: `High quality call - QA ${call.qa_score}`,
          verifyTranscript: false // Would need manual verification
        });
        imported++;
      } catch (error: any) {
        console.error(`Failed to import call ${call.id}:`, error.message);
      }
    }

    console.log(`[Test Generator] Imported ${imported} high-quality calls as test cases`);

    return imported;

  } catch (error: any) {
    console.error('[Test Generator] Error importing high-quality calls:', error);
    throw error;
  }
}

/**
 * Create test templates for common scenarios
 */
export async function createTestTemplates(): Promise<void> {
  const templates = [
    {
      name: 'Insurance Greeting',
      type: 'greeting',
      template: 'Hi {customer_name}, this is {agent_name} from {company}. I\'m calling about your insurance quote request.',
      variations: [
        'Hello {customer_name}, {agent_name} here from {company} insurance.',
        'Good {time_of_day} {customer_name}, this is {agent_name} with {company}.'
      ]
    },
    {
      name: 'Immediate Rejection',
      type: 'rejection',
      template: 'Not interested, please remove me from your list.',
      variations: [
        'I\'m not interested.',
        'Take me off your list.',
        'Don\'t call me again.',
        'I already told you I\'m not interested.'
      ]
    },
    {
      name: 'Price Objection',
      type: 'objection',
      template: 'That seems expensive. I can\'t afford {price} per month.',
      variations: [
        'That\'s too much money.',
        'I can\'t pay that much.',
        'Is there anything cheaper?',
        'My budget is only {budget} per month.'
      ]
    },
    {
      name: 'Already Covered',
      type: 'objection',
      template: 'I already have insurance through {provider}.',
      variations: [
        'I\'m covered through work.',
        'My spouse handles our insurance.',
        'I have {provider} and I\'m happy with them.',
        'I just signed up with {provider} last month.'
      ]
    },
    {
      name: 'Request Information',
      type: 'question',
      template: 'Can you send me more information about {topic}?',
      variations: [
        'What does this cover exactly?',
        'How much is the deductible?',
        'Does this include dental?',
        'Can you email me the details?'
      ]
    }
  ];

  for (const template of templates) {
    await db.none(`
      INSERT INTO ai_test_templates (
        name,
        template_type,
        text_template,
        variations,
        is_active
      ) VALUES ($1, $2, $3, $4, true)
      ON CONFLICT (name) DO UPDATE SET
        text_template = EXCLUDED.text_template,
        variations = EXCLUDED.variations
    `, [
      template.name,
      template.type,
      template.template,
      JSON.stringify(template.variations)
    ]);
  }

  console.log('[Test Generator] Created test templates');
}

/**
 * Generate test audio from templates (placeholder for future TTS integration)
 */
export async function generateTestAudioFromTemplate(
  templateId: string,
  variables: Record<string, string>
): Promise<string> {
  // This would integrate with a TTS service to generate test audio
  // For now, return a placeholder
  console.log('[Test Generator] Audio generation from templates not yet implemented');
  return '/test-audio/generated_placeholder.mp3';
}