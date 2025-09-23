import { NextResponse } from 'next/server';
import { checkDatabaseHealth, getPoolStats } from '@/server/lib/db-utils';
import { errorTracker } from '@/server/lib/error-tracker';
import { db } from '@/server/db';
import { logInfo } from '@/lib/log';

export const dynamic = 'force-dynamic';

interface ServiceHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  latency?: number;
  error?: string;
  details?: any;
}

interface QueueStatus {
  pending: number;
  processing: number;
  failed: number;
  completed_last_hour: number;
}

interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  services: {
    database: ServiceHealth;
    deepgram?: ServiceHealth;
    openai?: ServiceHealth;
    convoso?: ServiceHealth;
  };
  queue?: QueueStatus;
  errors: {
    last_hour: number;
    critical_count: number;
    buffer_size: number;
  };
  environment: {
    node_env: string;
    vercel_env?: string;
    commit_sha?: string;
    version?: string;
  };
  resources: {
    memory: {
      used_mb: number;
      total_mb: number;
      percent: number;
    };
    pool?: {
      total: number;
      active: number;
      idle: number;
      waiting: number;
      utilization: number;
    };
  };
}

async function checkDeepgramHealth(): Promise<ServiceHealth> {
  if (!process.env.DEEPGRAM_API_KEY) {
    return { status: 'unhealthy', error: 'API key not configured' };
  }

  try {
    const start = Date.now();
    const response = await fetch('https://api.deepgram.com/v1/projects', {
      headers: {
        'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`,
      },
      signal: AbortSignal.timeout(5000),
    });

    const latency = Date.now() - start;

    if (response.ok) {
      return { status: 'healthy', latency };
    } else {
      return { status: 'degraded', latency, error: `HTTP ${response.status}` };
    }
  } catch (error: any) {
    return { status: 'unhealthy', error: error.message };
  }
}

async function checkOpenAIHealth(): Promise<ServiceHealth> {
  if (!process.env.OPENAI_API_KEY) {
    return { status: 'unhealthy', error: 'API key not configured' };
  }

  try {
    const start = Date.now();
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      signal: AbortSignal.timeout(5000),
    });

    const latency = Date.now() - start;

    if (response.ok) {
      return { status: 'healthy', latency };
    } else {
      return { status: 'degraded', latency, error: `HTTP ${response.status}` };
    }
  } catch (error: any) {
    return { status: 'unhealthy', error: error.message };
  }
}

async function checkConvosoHealth(): Promise<ServiceHealth> {
  if (!process.env.CONVOSO_AUTH_TOKEN) {
    return { status: 'unhealthy', error: 'Auth token not configured' };
  }

  try {
    const start = Date.now();
    const response = await fetch(
      `https://api.convoso.com/v1/users/me?auth_token=${process.env.CONVOSO_AUTH_TOKEN}`,
      { signal: AbortSignal.timeout(5000) }
    );

    const latency = Date.now() - start;

    if (response.ok) {
      return { status: 'healthy', latency };
    } else {
      return { status: 'degraded', latency, error: `HTTP ${response.status}` };
    }
  } catch (error: any) {
    return { status: 'unhealthy', error: error.message };
  }
}

async function getQueueStatus(): Promise<QueueStatus | undefined> {
  try {
    const result = await db.one(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'processing') as processing,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        COUNT(*) FILTER (WHERE status = 'completed' AND updated_at > NOW() - INTERVAL '1 hour') as completed_last_hour
      FROM recording_queue
    `);

    return {
      pending: parseInt(result.pending || '0'),
      processing: parseInt(result.processing || '0'),
      failed: parseInt(result.failed || '0'),
      completed_last_hour: parseInt(result.completed_last_hour || '0'),
    };
  } catch (error) {
    return undefined;
  }
}

export async function GET(request: Request) {
  const startTime = Date.now();
  const uptime = process.uptime();

  try {
    const [dbHealth, deepgramHealth, openaiHealth, convosoHealth, queueStatus, errorStats] = await Promise.allSettled([
      checkDatabaseHealth(),
      checkDeepgramHealth(),
      checkOpenAIHealth(),
      checkConvosoHealth(),
      getQueueStatus(),
      errorTracker.getErrorStats(1),
    ]);

    const memUsage = process.memoryUsage();
    const memoryInfo = {
      used_mb: Math.round(memUsage.heapUsed / 1024 / 1024),
      total_mb: Math.round(memUsage.heapTotal / 1024 / 1024),
      percent: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100),
    };

    const dbHealthResult = dbHealth.status === 'fulfilled' ? dbHealth.value : { healthy: false, error: 'Check failed' };
    const deepgramResult = deepgramHealth.status === 'fulfilled' ? deepgramHealth.value : { status: 'unhealthy' as const };
    const openaiResult = openaiHealth.status === 'fulfilled' ? openaiHealth.value : { status: 'unhealthy' as const };
    const convosoResult = convosoHealth.status === 'fulfilled' ? convosoHealth.value : { status: 'unhealthy' as const };
    const queueResult = queueStatus.status === 'fulfilled' ? queueStatus.value : undefined;
    const errorResult = errorStats.status === 'fulfilled' ? errorStats.value : { total: 0, bySeverity: {} };

    const overallStatus = determineOverallStatus({
      database: dbHealthResult.healthy,
      deepgram: deepgramResult.status === 'healthy',
      openai: openaiResult.status === 'healthy',
      convoso: convosoResult.status === 'healthy',
      criticalErrors: (errorResult.bySeverity as any)?.critical > 0,
    });

    const response: HealthCheckResponse = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: Math.round(uptime),
      services: {
        database: {
          status: dbHealthResult.healthy ? 'healthy' : 'unhealthy',
          latency: dbHealthResult.latency,
          error: dbHealthResult.error,
          details: dbHealthResult.poolStats,
        },
        deepgram: deepgramResult,
        openai: openaiResult,
        convoso: convosoResult,
      },
      queue: queueResult,
      errors: {
        last_hour: errorResult.total,
        critical_count: (errorResult.bySeverity as any)?.critical || 0,
        buffer_size: errorTracker.getBufferSize(),
      },
      environment: {
        node_env: process.env.NODE_ENV || 'development',
        vercel_env: process.env.VERCEL_ENV,
        commit_sha: process.env.VERCEL_GIT_COMMIT_SHA?.substring(0, 7),
        version: process.env.npm_package_version,
      },
      resources: {
        memory: memoryInfo,
        pool: dbHealthResult.poolStats,
      },
    };

    logInfo('Health check completed', {
      status: overallStatus,
      duration: Date.now() - startTime,
    });

    return NextResponse.json(response, {
      status: overallStatus === 'unhealthy' ? 503 : 200,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'X-Response-Time': `${Date.now() - startTime}ms`,
      },
    });
  } catch (error: any) {
    logInfo('Health check failed', { error: error.message });

    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message,
      },
      { status: 503 }
    );
  }
}

function determineOverallStatus(services: {
  database: boolean;
  deepgram: boolean;
  openai: boolean;
  convoso: boolean;
  criticalErrors: boolean;
}): 'healthy' | 'degraded' | 'unhealthy' {
  if (!services.database || services.criticalErrors) {
    return 'unhealthy';
  }

  const healthyCount = [
    services.deepgram,
    services.openai,
    services.convoso,
  ].filter(Boolean).length;

  if (healthyCount < 2) {
    return 'degraded';
  }

  return 'healthy';
}