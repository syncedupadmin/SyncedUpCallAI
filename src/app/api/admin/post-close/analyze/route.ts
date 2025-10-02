import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { withStrictAgencyIsolation } from '@/lib/security/agency-isolation';
import { analyzeCompliance } from '@/lib/post-close-analysis';

export const dynamic = 'force-dynamic';

export const POST = withStrictAgencyIsolation(async (req, context) => {
  try {
    const body = await req.json();
    const { segment_id, script_id } = body;

    if (!segment_id || !script_id) {
      return NextResponse.json(
        { error: 'segment_id and script_id required' },
        { status: 400 }
      );
    }

    // Get segment and verify agency access
    const segment = await db.oneOrNone(`
      SELECT * FROM post_close_segments WHERE id = $1 AND agency_id = $2
    `, [segment_id, context.agencyId]);

    if (!segment) {
      return NextResponse.json({ error: 'Segment not found or access denied' }, { status: 404 });
    }

    // Verify script belongs to agency
    const script = await db.oneOrNone(`
      SELECT id FROM post_close_scripts WHERE id = $1 AND agency_id = $2
    `, [script_id, context.agencyId]);

    if (!script) {
      return NextResponse.json({ error: 'Script not found or access denied' }, { status: 404 });
    }

    // Analyze compliance
    const result = await analyzeCompliance(segment.transcript, script_id);

    // Store result with agency_id
    const complianceRecord = await db.one(`
      INSERT INTO post_close_compliance (
        segment_id,
        script_id,
        call_id,
        agency_id,
        overall_score,
        compliance_passed,
        word_match_percentage,
        phrase_match_percentage,
        sequence_score,
        missing_phrases,
        paraphrased_sections,
        sequence_errors,
        extra_content,
        levenshtein_distance,
        similarity_score,
        flagged_for_review,
        flag_reasons,
        agent_name
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      RETURNING *
    `, [
      segment_id,
      script_id,
      segment.call_id,
      context.agencyId,
      result.overall_score,
      result.compliance_passed,
      result.word_match_percentage,
      result.phrase_match_percentage,
      result.sequence_score,
      result.missing_phrases,
      JSON.stringify(result.paraphrased_sections),
      JSON.stringify(result.sequence_errors),
      result.extra_content,
      result.levenshtein_distance,
      result.similarity_score,
      result.flagged_for_review,
      result.flag_reasons,
      segment.agent_name
    ]);

    return NextResponse.json({
      success: true,
      compliance: complianceRecord,
      analysis: result
    });

  } catch (error: any) {
    console.error('Analysis failed:', error);
    return NextResponse.json(
      { error: error.message || 'Analysis failed' },
      { status: 500 }
    );
  }
});
