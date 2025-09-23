import { NextRequest, NextResponse } from 'next/server';
import { getPoolStats } from '@/server/lib/db-utils';
import { db } from '@/server/db';
import { logInfo } from '@/lib/log';
import { formatApiResponse } from '@/lib/api-formatter';

export const dynamic = 'force-dynamic';

interface SystemMetrics {
  timestamp: string;
  process: {
    uptime: number;
    pid: number;
    version: string;
    platform: string;
  };
  memory: {
    heap_used_mb: number;
    heap_total_mb: number;
    rss_mb: number;
    external_mb: number;
    utilization_percent: number;
  };
  database: {
    pool: {
      total: number;
      active: number;
      idle: number;
      waiting: number;
      utilization_percent: number;
    };
    query_performance?: {
      avg_latency_ms: number;
      p95_latency_ms: number;
      p99_latency_ms: number;
      slow_queries: number;
    };
  };
  api: {
    request_rate?: number;
    error_rate?: number;
    avg_response_time?: number;
  };
  resources: {
    cpu?: {
      user: number;
      system: number;
    };
  };
}

async function getQueryPerformanceMetrics(): Promise<SystemMetrics['database']['query_performance'] | undefined> {
  try {
    const result = await db.one(`
      SELECT
        AVG(mean_exec_time) as avg_latency,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY mean_exec_time) as p95_latency,
        PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY mean_exec_time) as p99_latency,
        COUNT(*) FILTER (WHERE mean_exec_time > 1000) as slow_queries
      FROM pg_stat_statements
      WHERE query NOT LIKE '%pg_stat_statements%'
        AND calls > 10
      LIMIT 1000
    `);

    return {
      avg_latency_ms: parseFloat(result.avg_latency || '0'),
      p95_latency_ms: parseFloat(result.p95_latency || '0'),
      p99_latency_ms: parseFloat(result.p99_latency || '0'),
      slow_queries: parseInt(result.slow_queries || '0'),
    };
  } catch (error) {
    return undefined;
  }
}

async function getApiMetrics(): Promise<SystemMetrics['api']> {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const result = await db.one(`
      SELECT
        COUNT(*) as total_requests,
        COUNT(*) FILTER (WHERE status_code >= 400) as error_requests,
        AVG(response_time_ms) as avg_response_time
      FROM api_logs
      WHERE timestamp >= $1
    `, [oneHourAgo]);

    const requestRate = parseInt(result.total_requests || '0') / 3600;
    const errorRate = parseInt(result.error_requests || '0') / parseInt(result.total_requests || '1');

    return {
      request_rate: requestRate,
      error_rate: errorRate,
      avg_response_time: parseFloat(result.avg_response_time || '0'),
    };
  } catch (error) {
    return {};
  }
}

export async function GET(request: NextRequest) {
  try {
    const startTime = Date.now();

    // Check if request is from a browser
    const acceptHeader = request.headers.get('accept') || '';
    const isHtmlRequest = acceptHeader.includes('text/html');

    const memUsage = process.memoryUsage();
    const poolStats = await getPoolStats();
    const queryPerf = await getQueryPerformanceMetrics();
    const apiMetrics = await getApiMetrics();

    const cpuUsage = process.cpuUsage();

    const metrics: SystemMetrics = {
      timestamp: new Date().toISOString(),
      process: {
        uptime: Math.round(process.uptime()),
        pid: process.pid,
        version: process.version,
        platform: process.platform,
      },
      memory: {
        heap_used_mb: Math.round(memUsage.heapUsed / 1024 / 1024),
        heap_total_mb: Math.round(memUsage.heapTotal / 1024 / 1024),
        rss_mb: Math.round(memUsage.rss / 1024 / 1024),
        external_mb: Math.round(memUsage.external / 1024 / 1024),
        utilization_percent: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100),
      },
      database: {
        pool: {
          total: poolStats.totalCount,
          active: poolStats.activeCount,
          idle: poolStats.idleCount,
          waiting: poolStats.waitingCount,
          utilization_percent: poolStats.utilizationPercent,
        },
        query_performance: queryPerf,
      },
      api: apiMetrics,
      resources: {
        cpu: {
          user: cpuUsage.user / 1000000,
          system: cpuUsage.system / 1000000,
        },
      },
    };

    logInfo({
      message: 'System metrics collected',
      duration: Date.now() - startTime,
      memory_used: metrics.memory.heap_used_mb,
      pool_utilization: metrics.database.pool.utilization_percent,
    });

    // Return HTML for browser requests
    if (isHtmlRequest) {
      // Format metrics for HTML display
      const formattedMetrics = {
        ...metrics,
        process: {
          ...metrics.process,
          uptime: metrics.process.uptime,
          node_version: metrics.process.version,
        },
        memory: {
          ...metrics.memory,
          percent: metrics.memory.utilization_percent,
        },
        database_pool: {
          total: metrics.database.pool.total,
          active: metrics.database.pool.active,
          idle: metrics.database.pool.idle,
          waiting: metrics.database.pool.waiting,
          utilization: metrics.database.pool.utilization_percent,
        },
      };

      const html = formatApiResponse(
        formattedMetrics,
        'System Metrics',
        'Real-time system performance and resource utilization metrics'
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
    logInfo({ message: 'Failed to collect system metrics', error: error.message });

    return NextResponse.json(
      { error: 'Failed to collect metrics', message: error.message },
      { status: 500 }
    );
  }
}