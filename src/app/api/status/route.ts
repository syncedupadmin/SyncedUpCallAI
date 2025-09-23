import { NextRequest, NextResponse } from 'next/server';
import { getPoolStats, checkDatabaseHealth } from '@/server/lib/db-utils';
import { errorTracker } from '@/server/lib/error-tracker';
import { db } from '@/server/db';
import { logInfo } from '@/lib/log';

export const dynamic = 'force-dynamic';

interface SystemStatus {
  status: 'operational' | 'degraded' | 'outage';
  timestamp: string;
  uptime: {
    seconds: number;
    formatted: string;
  };
  services: {
    database: {
      status: string;
      latency_ms?: number;
      connections: {
        active: number;
        idle: number;
        total: number;
      };
    };
    queues: {
      recordings: {
        pending: number;
        processing: number;
        failed: number;
        stale: number;
      };
      transcriptions: {
        pending: number;
        processing: number;
        completed_today: number;
      };
    };
    external_apis: {
      deepgram: string;
      openai: string;
      convoso: string;
    };
  };
  performance: {
    avg_response_time_ms: number;
    requests_per_minute: number;
    error_rate: number;
  };
  issues: Array<{
    type: 'error' | 'warning' | 'info';
    message: string;
    since?: string;
  }>;
  recent_activity: {
    calls_processed_last_hour: number;
    recordings_fetched_last_hour: number;
    transcriptions_completed_last_hour: number;
    analyses_completed_last_hour: number;
  };
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);

  return parts.join(' ') || '0m';
}

async function checkExternalAPIs() {
  const checks = {
    deepgram: 'unknown',
    openai: 'unknown',
    convoso: 'unknown',
  };

  const checkPromises = [];

  if (process.env.DEEPGRAM_API_KEY) {
    checkPromises.push(
      fetch('https://api.deepgram.com/v1/projects', {
        headers: { 'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}` },
        signal: AbortSignal.timeout(3000),
      })
        .then(res => { checks.deepgram = res.ok ? 'operational' : 'degraded'; })
        .catch(() => { checks.deepgram = 'down'; })
    );
  }

  if (process.env.OPENAI_API_KEY) {
    checkPromises.push(
      fetch('https://api.openai.com/v1/models', {
        headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
        signal: AbortSignal.timeout(3000),
      })
        .then(res => { checks.openai = res.ok ? 'operational' : 'degraded'; })
        .catch(() => { checks.openai = 'down'; })
    );
  }

  if (process.env.CONVOSO_AUTH_TOKEN) {
    checkPromises.push(
      fetch(`https://api.convoso.com/v1/users/me?auth_token=${process.env.CONVOSO_AUTH_TOKEN}`, {
        signal: AbortSignal.timeout(3000),
      })
        .then(res => { checks.convoso = res.ok ? 'operational' : 'degraded'; })
        .catch(() => { checks.convoso = 'down'; })
    );
  }

  await Promise.allSettled(checkPromises);
  return checks;
}

async function getQueueStatus() {
  try {
    const result = await db.one(`
      SELECT
        (SELECT COUNT(*) FROM recording_queue WHERE status = 'pending') as recordings_pending,
        (SELECT COUNT(*) FROM recording_queue WHERE status = 'processing') as recordings_processing,
        (SELECT COUNT(*) FROM recording_queue WHERE status = 'failed' AND created_at > NOW() - INTERVAL '24 hours') as recordings_failed,
        (SELECT COUNT(*) FROM recording_queue WHERE status = 'processing' AND updated_at < NOW() - INTERVAL '10 minutes') as recordings_stale,
        (SELECT COUNT(*) FROM calls WHERE transcription_status = 'pending' AND duration_seconds > 10) as transcriptions_pending,
        (SELECT COUNT(*) FROM calls WHERE transcription_status = 'processing') as transcriptions_processing,
        (SELECT COUNT(*) FROM calls WHERE transcription_status = 'completed' AND created_at > CURRENT_DATE) as transcriptions_completed_today
    `);

    return {
      recordings: {
        pending: parseInt(result.recordings_pending || '0'),
        processing: parseInt(result.recordings_processing || '0'),
        failed: parseInt(result.recordings_failed || '0'),
        stale: parseInt(result.recordings_stale || '0'),
      },
      transcriptions: {
        pending: parseInt(result.transcriptions_pending || '0'),
        processing: parseInt(result.transcriptions_processing || '0'),
        completed_today: parseInt(result.transcriptions_completed_today || '0'),
      },
    };
  } catch (error) {
    return {
      recordings: { pending: 0, processing: 0, failed: 0, stale: 0 },
      transcriptions: { pending: 0, processing: 0, completed_today: 0 },
    };
  }
}

async function getRecentActivity() {
  try {
    const result = await db.one(`
      SELECT
        (SELECT COUNT(*) FROM calls WHERE created_at > NOW() - INTERVAL '1 hour') as calls_processed,
        (SELECT COUNT(*) FROM recording_queue WHERE status = 'completed' AND updated_at > NOW() - INTERVAL '1 hour') as recordings_fetched,
        (SELECT COUNT(*) FROM calls WHERE transcript_completed_at > NOW() - INTERVAL '1 hour') as transcriptions_completed,
        (SELECT COUNT(*) FROM calls WHERE analysis_completed_at > NOW() - INTERVAL '1 hour') as analyses_completed
    `);

    return {
      calls_processed_last_hour: parseInt(result.calls_processed || '0'),
      recordings_fetched_last_hour: parseInt(result.recordings_fetched || '0'),
      transcriptions_completed_last_hour: parseInt(result.transcriptions_completed || '0'),
      analyses_completed_last_hour: parseInt(result.analyses_completed || '0'),
    };
  } catch (error) {
    return {
      calls_processed_last_hour: 0,
      recordings_fetched_last_hour: 0,
      transcriptions_completed_last_hour: 0,
      analyses_completed_last_hour: 0,
    };
  }
}

async function getPerformanceMetrics() {
  try {
    const result = await db.one(`
      SELECT
        AVG(response_time_ms) as avg_response_time,
        COUNT(*) as total_requests,
        COUNT(*) FILTER (WHERE status_code >= 400) as error_requests
      FROM api_logs
      WHERE timestamp > NOW() - INTERVAL '1 hour'
    `);

    return {
      avg_response_time_ms: parseFloat(result.avg_response_time || '0'),
      requests_per_minute: parseInt(result.total_requests || '0') / 60,
      error_rate: parseInt(result.error_requests || '0') / Math.max(1, parseInt(result.total_requests || '1')),
    };
  } catch (error) {
    return {
      avg_response_time_ms: 0,
      requests_per_minute: 0,
      error_rate: 0,
    };
  }
}

function identifyIssues(data: any): Array<any> {
  const issues = [];

  if (!data.dbHealth.healthy) {
    issues.push({
      type: 'error',
      message: 'Database connection is unhealthy',
      since: new Date().toISOString(),
    });
  }

  if (data.queues.recordings.stale > 0) {
    issues.push({
      type: 'warning',
      message: `${data.queues.recordings.stale} recordings stuck in processing`,
    });
  }

  if (data.queues.recordings.failed > 10) {
    issues.push({
      type: 'warning',
      message: `High number of failed recordings: ${data.queues.recordings.failed}`,
    });
  }

  if (data.performance.error_rate > 0.05) {
    issues.push({
      type: 'warning',
      message: `High error rate: ${(data.performance.error_rate * 100).toFixed(1)}%`,
    });
  }

  const errorStats = errorTracker.getErrorCounts();
  const criticalErrors = Array.from(errorStats.entries())
    .filter(([key]) => key.includes('critical'))
    .reduce((sum, [, count]) => sum + count, 0);

  if (criticalErrors > 0) {
    issues.push({
      type: 'error',
      message: `${criticalErrors} critical errors in buffer`,
    });
  }

  if (data.apis.deepgram === 'down') {
    issues.push({
      type: 'error',
      message: 'Deepgram API is unreachable',
    });
  }

  if (data.apis.openai === 'down') {
    issues.push({
      type: 'error',
      message: 'OpenAI API is unreachable',
    });
  }

  if (data.apis.convoso === 'down') {
    issues.push({
      type: 'warning',
      message: 'Convoso API is unreachable',
    });
  }

  return issues;
}

function determineOverallStatus(issues: Array<any>): 'operational' | 'degraded' | 'outage' {
  const hasErrors = issues.some(i => i.type === 'error');
  const hasWarnings = issues.some(i => i.type === 'warning');

  if (hasErrors) return 'outage';
  if (hasWarnings) return 'degraded';
  return 'operational';
}

export async function GET(request: NextRequest) {
  try {
    const startTime = Date.now();
    const uptime = process.uptime();

    const [dbHealth, poolStats, queues, apis, activity, performance] = await Promise.all([
      checkDatabaseHealth(),
      getPoolStats(),
      getQueueStatus(),
      checkExternalAPIs(),
      getRecentActivity(),
      getPerformanceMetrics(),
    ]);

    const issues = identifyIssues({
      dbHealth,
      queues,
      apis,
      performance,
    });

    const overallStatus = determineOverallStatus(issues);

    const status: SystemStatus = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: {
        seconds: Math.round(uptime),
        formatted: formatUptime(uptime),
      },
      services: {
        database: {
          status: dbHealth.healthy ? 'operational' : 'down',
          latency_ms: dbHealth.latency,
          connections: {
            active: poolStats.activeCount,
            idle: poolStats.idleCount,
            total: poolStats.totalCount,
          },
        },
        queues,
        external_apis: apis,
      },
      performance,
      issues,
      recent_activity: activity,
    };

    logInfo('Status check completed', {
      status: overallStatus,
      duration: Date.now() - startTime,
      issues: issues.length,
    });

    return NextResponse.json(status, {
      headers: {
        'Cache-Control': 'no-store, no-cache',
        'X-Response-Time': `${Date.now() - startTime}ms`,
      },
    });
  } catch (error: any) {
    logInfo('Status check failed', { error: error.message });

    return NextResponse.json(
      {
        status: 'outage',
        timestamp: new Date().toISOString(),
        error: error.message,
        issues: [{
          type: 'error',
          message: 'Failed to generate status report',
        }],
      },
      { status: 503 }
    );
  }
}