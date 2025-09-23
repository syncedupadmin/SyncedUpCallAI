import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/server/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

interface HealthMetric {
  name: string;
  value: number | string;
  status: 'healthy' | 'warning' | 'critical';
  unit?: string;
  threshold?: {
    warning: number;
    critical: number;
  };
}

interface SystemHealth {
  timestamp: Date;
  status: 'healthy' | 'degraded' | 'critical';
  uptime: number;
  metrics: {
    cpu: HealthMetric;
    memory: HealthMetric;
    database: HealthMetric;
    apiLatency: HealthMetric;
    activeUsers: HealthMetric;
    errorRate: HealthMetric;
    queueSize: HealthMetric;
    cacheHitRate: HealthMetric;
  };
  recentErrors: Array<{
    timestamp: Date;
    type: string;
    message: string;
    count: number;
  }>;
  activeAlerts: Array<{
    level: 'info' | 'warning' | 'critical';
    message: string;
    timestamp: Date;
  }>;
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Check authentication
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Gather health metrics
    const health = await gatherHealthMetrics();

    return NextResponse.json({
      ...health,
      responseTime: Date.now() - startTime
    });

  } catch (error: any) {
    console.error('Health check failed:', error);
    return NextResponse.json(
      {
        status: 'critical',
        error: error.message,
        timestamp: new Date()
      },
      { status: 500 }
    );
  }
}

async function gatherHealthMetrics(): Promise<SystemHealth> {
  const metrics: Partial<SystemHealth['metrics']> = {};
  const alerts: SystemHealth['activeAlerts'] = [];
  const recentErrors: SystemHealth['recentErrors'] = [];

  // 1. Database Health
  try {
    const dbStart = Date.now();
    const dbCheck = await db.oneOrNone('SELECT 1 as check, NOW() as time');
    const dbLatency = Date.now() - dbStart;

    metrics.database = {
      name: 'Database Connection',
      value: dbLatency,
      unit: 'ms',
      status: dbLatency < 100 ? 'healthy' : dbLatency < 500 ? 'warning' : 'critical',
      threshold: { warning: 100, critical: 500 }
    };

    // Connection pool stats
    const poolStats = await db.oneOrNone(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE state = 'active') as active,
        COUNT(*) FILTER (WHERE state = 'idle') as idle
      FROM pg_stat_activity
      WHERE datname = current_database()
    `);

    if (poolStats && poolStats.total > 80) {
      alerts.push({
        level: 'warning',
        message: `High database connection usage: ${poolStats.active} active, ${poolStats.idle} idle`,
        timestamp: new Date()
      });
    }
  } catch (error: any) {
    metrics.database = {
      name: 'Database Connection',
      value: 'Error',
      status: 'critical'
    };
    alerts.push({
      level: 'critical',
      message: `Database connection failed: ${error.message}`,
      timestamp: new Date()
    });
  }

  // 2. API Latency Check
  try {
    const apiStart = Date.now();
    const testEndpoint = `${process.env.APP_URL || 'http://localhost:3000'}/api/health`;
    const response = await fetch(testEndpoint, {
      signal: AbortSignal.timeout(5000)
    }).catch(() => null);

    const apiLatency = Date.now() - apiStart;

    metrics.apiLatency = {
      name: 'API Response Time',
      value: apiLatency,
      unit: 'ms',
      status: apiLatency < 200 ? 'healthy' : apiLatency < 1000 ? 'warning' : 'critical',
      threshold: { warning: 200, critical: 1000 }
    };
  } catch (error: any) {
    metrics.apiLatency = {
      name: 'API Response Time',
      value: 'Timeout',
      status: 'critical'
    };
  }

  // 3. Active Users
  try {
    const activeUsers = await db.oneOrNone(`
      SELECT COUNT(DISTINCT user_id) as count
      FROM auth.sessions
      WHERE expires_at > NOW()
    `);

    metrics.activeUsers = {
      name: 'Active Sessions',
      value: activeUsers?.count || 0,
      status: 'healthy'
    };
  } catch (error) {
    metrics.activeUsers = {
      name: 'Active Sessions',
      value: 0,
      status: 'warning'
    };
  }

  // 4. Error Rate (last hour)
  try {
    const errors = await db.manyOrNone(`
      SELECT
        error_type,
        COUNT(*) as count,
        MAX(created_at) as last_seen
      FROM error_logs
      WHERE created_at > NOW() - INTERVAL '1 hour'
      GROUP BY error_type
      ORDER BY count DESC
      LIMIT 5
    `).catch(() => []);

    const totalErrors = errors.reduce((sum, e) => sum + parseInt(e.count), 0);

    metrics.errorRate = {
      name: 'Errors (1h)',
      value: totalErrors,
      status: totalErrors < 10 ? 'healthy' : totalErrors < 50 ? 'warning' : 'critical',
      threshold: { warning: 10, critical: 50 }
    };

    // Convert to recent errors format
    recentErrors.push(...errors.map(e => ({
      timestamp: new Date(e.last_seen),
      type: e.error_type,
      message: `${e.error_type} errors`,
      count: parseInt(e.count)
    })));

    if (totalErrors > 50) {
      alerts.push({
        level: 'critical',
        message: `High error rate: ${totalErrors} errors in the last hour`,
        timestamp: new Date()
      });
    }
  } catch (error) {
    metrics.errorRate = {
      name: 'Errors (1h)',
      value: 'Unknown',
      status: 'warning'
    };
  }

  // 5. Queue Size
  try {
    const queueStats = await db.oneOrNone(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'processing') as processing,
        COUNT(*) FILTER (WHERE status = 'failed' AND created_at > NOW() - INTERVAL '24 hours') as failed
      FROM call_processing_queue
    `).catch(() => ({ pending: 0, processing: 0, failed: 0 }));

    const totalQueue = (queueStats?.pending || 0) + (queueStats?.processing || 0);

    metrics.queueSize = {
      name: 'Queue Size',
      value: totalQueue,
      status: totalQueue < 100 ? 'healthy' : totalQueue < 500 ? 'warning' : 'critical',
      threshold: { warning: 100, critical: 500 }
    };

    if (queueStats?.failed > 10) {
      alerts.push({
        level: 'warning',
        message: `${queueStats.failed} failed queue items in last 24h`,
        timestamp: new Date()
      });
    }
  } catch (error) {
    metrics.queueSize = {
      name: 'Queue Size',
      value: 'Unknown',
      status: 'warning'
    };
  }

  // 6. Cache Hit Rate
  try {
    const cacheStats = await db.oneOrNone(`
      SELECT
        ROUND(
          sum(heap_blks_hit)::numeric /
          NULLIF(sum(heap_blks_hit) + sum(heap_blks_read), 0) * 100,
          2
        ) as hit_rate
      FROM pg_statio_user_tables
    `);

    const hitRate = cacheStats?.hit_rate || 0;

    metrics.cacheHitRate = {
      name: 'Cache Hit Rate',
      value: `${hitRate}%`,
      status: hitRate > 90 ? 'healthy' : hitRate > 75 ? 'warning' : 'critical',
      threshold: { warning: 90, critical: 75 }
    };
  } catch (error) {
    metrics.cacheHitRate = {
      name: 'Cache Hit Rate',
      value: 'Unknown',
      status: 'warning'
    };
  }

  // 7. Memory Usage (estimated based on connections)
  try {
    const memoryEstimate = await db.oneOrNone(`
      SELECT
        pg_database_size(current_database()) as db_size,
        (SELECT COUNT(*) FROM pg_stat_activity) * 10 as estimated_mb
    `);

    const memoryMB = Math.round((memoryEstimate?.estimated_mb || 0) / 1024 / 1024);

    metrics.memory = {
      name: 'Estimated Memory',
      value: memoryMB,
      unit: 'MB',
      status: memoryMB < 500 ? 'healthy' : memoryMB < 1000 ? 'warning' : 'critical',
      threshold: { warning: 500, critical: 1000 }
    };
  } catch (error) {
    metrics.memory = {
      name: 'Estimated Memory',
      value: 'Unknown',
      status: 'warning'
    };
  }

  // 8. CPU Usage (estimated based on query times)
  try {
    const cpuEstimate = await db.oneOrNone(`
      SELECT
        ROUND(AVG(mean_exec_time)) as avg_query_time,
        COUNT(*) as query_count
      FROM pg_stat_statements
      WHERE calls > 0
    `).catch(() => ({ avg_query_time: 0, query_count: 0 }));

    // Rough CPU estimate based on query performance
    const cpuScore = cpuEstimate?.avg_query_time || 0;

    metrics.cpu = {
      name: 'Query Performance',
      value: cpuScore,
      unit: 'ms avg',
      status: cpuScore < 50 ? 'healthy' : cpuScore < 200 ? 'warning' : 'critical',
      threshold: { warning: 50, critical: 200 }
    };
  } catch (error) {
    metrics.cpu = {
      name: 'Query Performance',
      value: 'Unknown',
      status: 'warning'
    };
  }

  // Calculate overall status
  const metricStatuses = Object.values(metrics).map(m => m.status);
  let overallStatus: 'healthy' | 'degraded' | 'critical' = 'healthy';

  if (metricStatuses.includes('critical')) {
    overallStatus = 'critical';
  } else if (metricStatuses.includes('warning')) {
    overallStatus = 'degraded';
  }

  // Add general alerts based on overall status
  if (overallStatus === 'critical') {
    alerts.unshift({
      level: 'critical',
      message: 'System is experiencing critical issues. Immediate attention required.',
      timestamp: new Date()
    });
  } else if (overallStatus === 'degraded') {
    alerts.unshift({
      level: 'warning',
      message: 'System performance is degraded. Monitor closely.',
      timestamp: new Date()
    });
  }

  return {
    timestamp: new Date(),
    status: overallStatus,
    uptime: process.uptime(),
    metrics: metrics as SystemHealth['metrics'],
    recentErrors,
    activeAlerts: alerts
  };
}

// WebSocket endpoint for real-time updates (future enhancement)
export async function POST(request: NextRequest) {
  try {
    const { subscribe } = await request.json();

    if (subscribe) {
      // In a real implementation, this would set up a WebSocket connection
      // or Server-Sent Events stream for real-time updates
      return NextResponse.json({
        message: 'Real-time monitoring subscription noted. WebSocket support coming soon.',
        pollInterval: 5000 // Suggest polling interval in ms
      });
    }

    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to process request', message: error.message },
      { status: 500 }
    );
  }
}