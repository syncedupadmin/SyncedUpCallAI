/**
 * API Route: /api/analyze-v2
 *
 * TEST ENDPOINT for new 3-pass sequential analysis architecture
 *
 * This endpoint uses the new unified-analysis-v2.ts system with:
 * - Pass 1: Comprehensive extraction (GPT-4o-mini)
 * - Pass 2: Opening & post-close analysis (GPT-4o-mini + fuzzy matching)
 * - Pass 3: Final white card with full context (GPT-4o)
 *
 * All passes use OpenAI Structured Outputs (strict: true) for 100% reliability
 */

import { NextRequest, NextResponse } from 'next/server';
import { analyzeCallV2 } from '@/lib/unified-analysis-v2';
import { logInfo, logError } from '@/lib/log';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes for complex analysis

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { audioUrl, meta, settings } = body;

    if (!audioUrl) {
      return NextResponse.json(
        { error: 'audioUrl is required' },
        { status: 400 }
      );
    }

    logInfo({
      event_type: 'analyze_v2_api_request',
      audio_url: audioUrl,
      has_meta: !!meta,
      has_settings: !!settings
    });

    // Run new 3-pass analysis
    const result = await analyzeCallV2(audioUrl, meta, settings);

    logInfo({
      event_type: 'analyze_v2_api_success',
      outcome: result.outcome,
      opening_quality: result.opening_quality,
      compliance_status: result.compliance_status,
      duration_ms: result.duration_ms
    });

    return NextResponse.json({
      success: true,
      data: result,
      metadata: {
        analysis_version: 'v2_3pass_sequential',
        timestamp: new Date().toISOString(),
        duration_ms: result.duration_ms
      }
    });

  } catch (error: any) {
    logError('analyze_v2_api_error', error, {
      event_type: 'analyze_v2_api_error',
      error_message: error.message
    });

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Analysis failed',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint for testing/health check
 */
export async function GET(request: NextRequest) {
  return NextResponse.json({
    endpoint: '/api/analyze-v2',
    status: 'ready',
    version: 'v2_3pass_sequential',
    description: 'Test endpoint for new 3-pass analysis architecture',
    architecture: {
      pass1: 'Comprehensive extraction (GPT-4o-mini, strict JSON schema)',
      pass2: 'Opening & compliance analysis (GPT-4o-mini + fuzzy matching)',
      pass3: 'Final white card with full context (GPT-4o)'
    },
    usage: {
      method: 'POST',
      body: {
        audioUrl: 'string (required) - URL to audio file',
        meta: 'object (optional) - Call metadata (agent_id, call_id, product_type, state)',
        settings: 'object (optional) - ASR/analysis settings override'
      }
    },
    example: {
      audioUrl: 'https://example.com/recording.mp3',
      meta: {
        agent_id: 'agent_123',
        call_id: 'call_456',
        product_type: 'health',
        state: 'CA'
      }
    }
  });
}
