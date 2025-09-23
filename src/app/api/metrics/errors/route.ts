import { NextRequest, NextResponse } from 'next/server';
import { errorTracker, ErrorSeverity, ErrorCategory } from '@/server/lib/error-tracker';
import { db } from '@/server/db';
import { withRetry } from '@/server/lib/db-utils';
import { logInfo, logError } from '@/lib/log';
import { formatApiResponse } from '@/lib/api-formatter';

export const dynamic = 'force-dynamic';

interface ErrorMetrics {
  timestamp: string;
  summary: {
    total_24h: number;
    total_1h: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    unresolved: number;
    buffer_size: number;
    last_flush: string;
  };
  by_category: Record<string, number>;
  by_endpoint: Array<{
    endpoint: string;
    count: number;
    last_error: string;
  }>;
  recent_critical: Array<{
    timestamp: string;
    message: string;
    category: string;
    context?: any;
  }>;
  top_errors: Array<{
    message: string;
    count: number;
    category: string;
    severity: string;
  }>;
  trends: {
    error_rate_per_hour: number[];
    critical_rate_per_hour: number[];
  };
}

async function getErrorSummary() {
  try {
    const [stats24h, stats1h] = await Promise.all([
      errorTracker.getErrorStats(24),
      errorTracker.getErrorStats(1),
    ]);

    const unresolvedCount = await withRetry(() =>
      db.one(
        `SELECT COUNT(*) as count FROM error_logs WHERE resolved = false AND timestamp > NOW() - INTERVAL '24 hours'`
      )
    );

    return {
      total_24h: stats24h.total,
      total_1h: stats1h.total,
      critical: stats1h.bySeverity.critical || 0,
      high: stats1h.bySeverity.high || 0,
      medium: stats1h.bySeverity.medium || 0,
      low: stats1h.bySeverity.low || 0,
      unresolved: parseInt(unresolvedCount.count || '0'),
      buffer_size: errorTracker.getBufferSize(),
      last_flush: errorTracker.getLastFlushTime().toISOString(),
    };
  } catch (error) {
    return {
      total_24h: 0,
      total_1h: 0,
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      unresolved: 0,
      buffer_size: errorTracker.getBufferSize(),
      last_flush: errorTracker.getLastFlushTime().toISOString(),
    };
  }
}

async function getErrorsByCategory() {
  try {
    const results = await withRetry(() =>
      db.manyOrNone(
        `SELECT category, COUNT(*) as count
         FROM error_logs
         WHERE timestamp > NOW() - INTERVAL '24 hours'
         GROUP BY category
         ORDER BY count DESC`
      )
    );

    return results.reduce((acc, { category, count }) => {
      acc[category] = parseInt(count);
      return acc;
    }, {} as Record<string, number>);
  } catch (error) {
    return {};
  }
}

async function getErrorsByEndpoint(limit: number = 10) {
  try {
    const results = await withRetry(() =>
      db.manyOrNone(
        `SELECT
           context->>'endpoint' as endpoint,
           COUNT(*) as count,
           MAX(message) as last_error
         FROM error_logs
         WHERE timestamp > NOW() - INTERVAL '24 hours'
           AND context->>'endpoint' IS NOT NULL
         GROUP BY context->>'endpoint'
         ORDER BY count DESC
         LIMIT $1`,
        [limit]
      )
    );

    return results.map(({ endpoint, count, last_error }) => ({
      endpoint,
      count: parseInt(count),
      last_error,
    }));
  } catch (error) {
    return [];
  }
}

async function getRecentCriticalErrors(limit: number = 10) {
  try {
    const results = await withRetry(() =>
      db.manyOrNone(
        `SELECT timestamp, message, category, context
         FROM error_logs
         WHERE severity = $1
           AND timestamp > NOW() - INTERVAL '24 hours'
         ORDER BY timestamp DESC
         LIMIT $2`,
        [ErrorSeverity.CRITICAL, limit]
      )
    );

    return results.map(({ timestamp, message, category, context }) => ({
      timestamp: timestamp.toISOString(),
      message,
      category,
      context,
    }));
  } catch (error) {
    return [];
  }
}

async function getTopErrors(limit: number = 10) {
  try {
    const results = await withRetry(() =>
      db.manyOrNone(
        `SELECT
           message,
           COUNT(*) as count,
           category,
           severity
         FROM error_logs
         WHERE timestamp > NOW() - INTERVAL '24 hours'
         GROUP BY message, category, severity
         ORDER BY count DESC
         LIMIT $1`,
        [limit]
      )
    );

    return results.map(({ message, count, category, severity }) => ({
      message,
      count: parseInt(count),
      category,
      severity,
    }));
  } catch (error) {
    return [];
  }
}

async function getErrorTrends() {
  try {
    const results = await withRetry(() =>
      db.manyOrNone(
        `SELECT
           DATE_TRUNC('hour', timestamp) as hour,
           COUNT(*) as total,
           COUNT(*) FILTER (WHERE severity = $1) as critical
         FROM error_logs
         WHERE timestamp > NOW() - INTERVAL '24 hours'
         GROUP BY hour
         ORDER BY hour`,
        [ErrorSeverity.CRITICAL]
      )
    );

    const errorRatePerHour = results.map(r => parseInt(r.total));
    const criticalRatePerHour = results.map(r => parseInt(r.critical));

    return {
      error_rate_per_hour: errorRatePerHour,
      critical_rate_per_hour: criticalRatePerHour,
    };
  } catch (error) {
    return {
      error_rate_per_hour: [],
      critical_rate_per_hour: [],
    };
  }
}

export async function GET(request: NextRequest) {
  try {
    const startTime = Date.now();

    // Check if request is from a browser
    const acceptHeader = request.headers.get('accept') || '';
    const isHtmlRequest = acceptHeader.includes('text/html');

    const [summary, byCategory, byEndpoint, recentCritical, topErrors, trends] = await Promise.all([
      getErrorSummary(),
      getErrorsByCategory(),
      getErrorsByEndpoint(),
      getRecentCriticalErrors(),
      getTopErrors(),
      getErrorTrends(),
    ]);

    const metrics: ErrorMetrics = {
      timestamp: new Date().toISOString(),
      summary,
      by_category: byCategory,
      by_endpoint: byEndpoint,
      recent_critical: recentCritical,
      top_errors: topErrors,
      trends,
    };

    logInfo({
      message: 'Error metrics collected',
      duration: Date.now() - startTime,
      total_errors: summary.total_1h,
      critical_errors: summary.critical,
    });

    // Return HTML for browser requests
    if (isHtmlRequest) {
      const html = formatApiResponse(
        metrics,
        'Error Metrics',
        'Real-time error tracking and analysis dashboard'
      );

      return new NextResponse(html, {
        headers: {
          'Content-Type': 'text/html',
          'Cache-Control': 'no-store, no-cache',
          'X-Response-Time': `${Date.now() - startTime}ms`,
        },
      });
    }

    return NextResponse.json(metrics, {
      headers: {
        'Cache-Control': 'no-store, no-cache',
        'X-Response-Time': `${Date.now() - startTime}ms`,
      },
    });
  } catch (error: any) {
    logError('Failed to collect error metrics', { error: error.message });

    return NextResponse.json(
      { error: 'Failed to collect metrics', message: error.message },
      { status: 500 }
    );
  }
}