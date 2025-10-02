import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { withStrictAgencyIsolation } from '@/lib/security/agency-isolation';

export const dynamic = 'force-dynamic';

export const GET = withStrictAgencyIsolation(async (req, context) => {
  try {
    // Check for call_id filter
    const { searchParams } = new URL(req.url);
    const callId = searchParams.get('call_id');

    // Superadmins see all data, regular users see only their agency
    const baseQuery = `SELECT
      pc.*,
      pcs.transcript,
      COALESCE(pcs.agent_name, pc.agent_name) as agent_name,
      pcs.created_at as segment_created_at,
      ps.script_name,
      c.campaign
    FROM post_close_compliance pc
    LEFT JOIN post_close_segments pcs ON pcs.id = pc.segment_id
    LEFT JOIN post_close_scripts ps ON ps.id = pc.script_id
    LEFT JOIN calls c ON c.id = pc.call_id`;

    let query: string;
    let params: any[];

    if (context.isSuperAdmin) {
      // Superadmin: no agency filter
      query = callId
        ? `${baseQuery} WHERE pc.call_id = $1 ORDER BY pc.analyzed_at DESC LIMIT 100`
        : `${baseQuery} ORDER BY pc.analyzed_at DESC LIMIT 100`;
      params = callId ? [callId] : [];
    } else {
      // Regular user: filter by agency
      query = callId
        ? `${baseQuery} WHERE pc.call_id = $1 AND pc.agency_id = $2 ORDER BY pc.analyzed_at DESC LIMIT 100`
        : `${baseQuery} WHERE pc.agency_id = $1 ORDER BY pc.analyzed_at DESC LIMIT 100`;
      params = callId ? [callId, context.agencyId] : [context.agencyId];
    }

    const results = await db.manyOrNone(query, params);

    // Parse JSON fields that come as strings from database
    const parsedResults = (results || []).map(r => ({
      ...r,
      paraphrased_sections: typeof r.paraphrased_sections === 'string'
        ? JSON.parse(r.paraphrased_sections || '[]')
        : (r.paraphrased_sections || []),
      sequence_errors: typeof r.sequence_errors === 'string'
        ? JSON.parse(r.sequence_errors || '[]')
        : (r.sequence_errors || []),
      missing_phrases: Array.isArray(r.missing_phrases)
        ? r.missing_phrases
        : (r.missing_phrases || []),
      flag_reasons: Array.isArray(r.flag_reasons)
        ? r.flag_reasons
        : (r.flag_reasons || [])
    }));

    return NextResponse.json({
      success: true,
      results: parsedResults
    });

  } catch (error: any) {
    console.error('Failed to fetch post-close compliance results:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch results' },
      { status: 500 }
    );
  }
});
