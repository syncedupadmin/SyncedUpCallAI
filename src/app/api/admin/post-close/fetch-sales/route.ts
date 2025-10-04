/**
 * API Endpoint: Fetch Sales from Convoso for Compliance
 * Implements 2-part workflow: Agent discovery → Sales fetching
 *
 * POST /api/admin/post-close/fetch-sales
 */

import { NextRequest, NextResponse } from 'next/server';
import { withStrictAgencyIsolation } from '@/lib/security/agency-isolation';
import { createComplianceConvosoService } from '@/lib/compliance-convoso';
import { logInfo, logError } from '@/lib/log';
import { db } from '@/server/db';

export const dynamic = 'force-dynamic';

interface FetchSalesRequest {
  date_range?: {
    start: string;
    end: string;
  };
  agent_ids?: string[];
  auto_discover?: boolean;
  process_compliance?: boolean;
}

/**
 * POST: Fetch sales calls from Convoso and prepare for compliance
 */
async function handler(
  request: NextRequest,
  context: { userId: string; agencyId: string; agencyIds: string[]; role: string; isSuperAdmin: boolean }
) {
  const startTime = Date.now();

  try {
    const body: FetchSalesRequest = await request.json();

    logInfo({
      event_type: 'compliance_sales_fetch_request',
      agency_id: context.agencyId,
      user_id: context.userId,
      params: body
    });

    // Create Convoso service for this agency
    const service = await createComplianceConvosoService(context.agencyId);

    if (!service) {
      return NextResponse.json(
        {
          success: false,
          error: 'Convoso credentials not configured for this agency'
        },
        { status: 400 }
      );
    }

    // Parse date range if provided, or default to 90 days
    let dateRange;
    if (body.date_range) {
      dateRange = {
        start: new Date(body.date_range.start),
        end: new Date(body.date_range.end)
      };

      // Validate date range
      if (dateRange.start > dateRange.end) {
        return NextResponse.json(
          {
            success: false,
            error: 'Invalid date range: start date must be before end date'
          },
          { status: 400 }
        );
      }

      // Check if range is too short (less than 7 days)
      const daysDiff = Math.floor((dateRange.end.getTime() - dateRange.start.getTime()) / (1000 * 60 * 60 * 24));
      if (daysDiff < 7) {
        // Override with 90 days to ensure we get enough sales
        logInfo({
          event_type: 'date_range_override',
          original_days: daysDiff,
          new_days: 90,
          reason: 'range_too_short'
        });
        dateRange = {
          start: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
          end: new Date()
        };
      }

      // Allow up to 90 days max
      if (daysDiff > 90) {
        return NextResponse.json(
          {
            success: false,
            error: 'Date range cannot exceed 90 days'
          },
          { status: 400 }
        );
      }
    }

    // Execute the 2-part workflow
    const result = await service.executeSyncWorkflow(dateRange);

    // If requested, trigger compliance processing for new segments
    if (body.process_compliance && result.segments_created > 0) {
      await triggerComplianceProcessing(context.agencyId);
    }

    const duration = Date.now() - startTime;

    // Get summary stats
    const stats = await getComplianceSyncStats(context.agencyId);

    logInfo({
      event_type: 'compliance_sales_fetch_complete',
      agency_id: context.agencyId,
      user_id: context.userId,
      duration_ms: duration,
      result
    });

    return NextResponse.json({
      success: result.success,
      data: {
        agents_discovered: result.agents_discovered,
        sales_fetched: result.sales_fetched,
        segments_created: result.segments_created,
        processing_time_ms: duration
      },
      stats,
      errors: result.errors.length > 0 ? result.errors : undefined
    });

  } catch (error: any) {
    logError('Failed to fetch sales from Convoso', error, {
      agency_id: context.agencyId,
      user_id: context.userId
    });

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch sales data',
        details: error.message
      },
      { status: 500 }
    );
  }
}

/**
 * GET: Check sync status and agent configurations
 */
async function getHandler(
  request: NextRequest,
  context: { userId: string; agencyId: string; agencyIds: string[]; role: string; isSuperAdmin: boolean }
) {
  try {
    // Get agent configurations
    const agents = await db.manyOrNone(`
      SELECT
        cac.id,
        cac.convoso_agent_id,
        cac.agent_name,
        cac.agent_email,
        cac.monitor_enabled,
        cac.compliance_threshold,
        cac.auto_sync_sales,
        cac.last_synced_at,
        cac.sync_status,
        cac.total_sales_synced,
        COUNT(DISTINCT pcs.id) as pending_segments,
        COUNT(DISTINCT pcc.id) as analyzed_segments
      FROM compliance_agent_config cac
      LEFT JOIN post_close_segments pcs ON
        pcs.convoso_agent_id = cac.convoso_agent_id
        AND pcs.agency_id = cac.agency_id
      LEFT JOIN post_close_compliance pcc ON
        pcc.segment_id = pcs.id
      WHERE cac.agency_id = $1
      GROUP BY cac.id
      ORDER BY cac.agent_name
    `, [context.agencyId]);

    // Get recent sync logs
    const syncLogs = await db.manyOrNone(`
      SELECT
        id,
        sync_type,
        agent_name,
        date_range_start,
        date_range_end,
        calls_fetched,
        sales_found,
        compliance_segments_created,
        sync_status,
        error_message,
        created_at
      FROM compliance_convoso_sync_log
      WHERE agency_id = $1
      ORDER BY created_at DESC
      LIMIT 20
    `, [context.agencyId]);

    // Get overall sync stats
    const stats = await getComplianceSyncStats(context.agencyId);

    return NextResponse.json({
      success: true,
      data: {
        agents,
        sync_logs: syncLogs,
        stats
      }
    });

  } catch (error: any) {
    logError('Failed to get sync status', error, {
      agency_id: context.agencyId
    });

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to retrieve sync status'
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH: Update agent configuration
 */
async function patchHandler(
  request: NextRequest,
  context: { userId: string; agencyId: string; agencyIds: string[]; role: string; isSuperAdmin: boolean }
) {
  try {
    const body = await request.json();
    const { agent_id, updates } = body;

    if (!agent_id) {
      return NextResponse.json(
        {
          success: false,
          error: 'Agent ID is required'
        },
        { status: 400 }
      );
    }

    // Update agent configuration
    await db.none(`
      UPDATE compliance_agent_config
      SET
        monitor_enabled = COALESCE($3, monitor_enabled),
        compliance_threshold = COALESCE($4, compliance_threshold),
        alert_on_failure = COALESCE($5, alert_on_failure),
        auto_sync_sales = COALESCE($6, auto_sync_sales),
        updated_at = NOW()
      WHERE agency_id = $1 AND convoso_agent_id = $2
    `, [
      context.agencyId,
      agent_id,
      updates.monitor_enabled,
      updates.compliance_threshold,
      updates.alert_on_failure,
      updates.auto_sync_sales
    ]);

    logInfo({
      event_type: 'agent_config_updated',
      agency_id: context.agencyId,
      agent_id,
      updates
    });

    return NextResponse.json({
      success: true,
      message: 'Agent configuration updated'
    });

  } catch (error: any) {
    logError('Failed to update agent config', error, {
      agency_id: context.agencyId
    });

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to update agent configuration'
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE: Remove agent from monitoring
 */
async function deleteHandler(
  request: NextRequest,
  context: { userId: string; agencyId: string; agencyIds: string[]; role: string; isSuperAdmin: boolean }
) {
  try {
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get('agent_id');

    if (!agentId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Agent ID is required'
        },
        { status: 400 }
      );
    }

    // Soft delete - just disable monitoring
    await db.none(`
      UPDATE compliance_agent_config
      SET
        monitor_enabled = false,
        auto_sync_sales = false,
        updated_at = NOW()
      WHERE agency_id = $1 AND convoso_agent_id = $2
    `, [context.agencyId, agentId]);

    logInfo({
      event_type: 'agent_monitoring_disabled',
      agency_id: context.agencyId,
      agent_id: agentId
    });

    return NextResponse.json({
      success: true,
      message: 'Agent monitoring disabled'
    });

  } catch (error: any) {
    logError('Failed to disable agent monitoring', error, {
      agency_id: context.agencyId
    });

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to disable agent monitoring'
      },
      { status: 500 }
    );
  }
}

/**
 * Trigger compliance processing for new segments
 */
async function triggerComplianceProcessing(agencyId: string): Promise<void> {
  try {
    // Mark segments for immediate processing
    await db.none(`
      UPDATE calls
      SET compliance_processed = false
      WHERE agency_id = $1
      AND compliance_required = true
      AND compliance_processed = false
      AND created_at >= NOW() - INTERVAL '24 hours'
    `, [agencyId]);

    // Optionally trigger the cron job immediately
    // This would depend on your infrastructure
    logInfo({
      event_type: 'compliance_processing_triggered',
      agency_id: agencyId
    });

  } catch (error: any) {
    logInfo({
      event_type: 'compliance_trigger_failed',
      agency_id: agencyId,
      error: error.message
    });
  }
}

/**
 * Get compliance sync statistics
 */
async function getComplianceSyncStats(agencyId: string): Promise<any> {
  try {
    const stats = await db.one(`
      SELECT
        COUNT(DISTINCT cac.convoso_agent_id) as total_agents,
        COUNT(DISTINCT cac.convoso_agent_id) FILTER (WHERE cac.monitor_enabled) as monitored_agents,
        COUNT(DISTINCT pcs.id) as total_segments,
        COUNT(DISTINCT pcs.id) FILTER (WHERE pcs.created_at >= NOW() - INTERVAL '24 hours') as segments_24h,
        COUNT(DISTINCT pcc.id) as analyzed_segments,
        AVG(pcc.overall_score) as avg_compliance_score,
        COUNT(DISTINCT pcc.id) FILTER (WHERE pcc.compliance_passed) as passed_count,
        COUNT(DISTINCT pcc.id) FILTER (WHERE NOT pcc.compliance_passed) as failed_count
      FROM compliance_agent_config cac
      LEFT JOIN post_close_segments pcs ON pcs.agency_id = cac.agency_id
      LEFT JOIN post_close_compliance pcc ON pcc.segment_id = pcs.id
      WHERE cac.agency_id = $1
    `, [agencyId]);

    return stats;

  } catch (error: any) {
    logError('Failed to get sync stats', error, { agency_id: agencyId });
    return null;
  }
}

// Export wrapped handlers
export const POST = withStrictAgencyIsolation(handler);
export const GET = withStrictAgencyIsolation(getHandler);
export const PATCH = withStrictAgencyIsolation(patchHandler);
export const DELETE = withStrictAgencyIsolation(deleteHandler);