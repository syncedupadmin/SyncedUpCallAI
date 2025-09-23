import { db } from '@/server/db';
import { logError, logInfo } from '@/lib/log';

export interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  retryableErrors?: string[];
  timeout?: number;
}

const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelay: 100,
  maxDelay: 5000,
  backoffMultiplier: 2,
  retryableErrors: [
    '40001', // serialization_failure
    '40P01', // deadlock_detected
    '55P03', // lock_not_available
    '57014', // query_canceled
    '08006', // connection_failure
    '08003', // connection_does_not_exist
    '08001', // sqlclient_unable_to_establish_sqlconnection
    '53300', // too_many_connections
    '53400', // configuration_limit_exceeded
    'ECONNREFUSED',
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND'
  ],
  timeout: 30000
};

export class DatabaseError extends Error {
  constructor(
    message: string,
    public code?: string,
    public detail?: string,
    public isRetryable?: boolean
  ) {
    super(message);
    this.name = 'DatabaseError';
  }
}

function isRetryableError(error: any, retryableErrors: string[]): boolean {
  if (!error) return false;

  const errorCode = error.code || error.sqlState || '';
  const errorMessage = error.message || '';

  return retryableErrors.some(code =>
    errorCode === code ||
    errorCode.includes(code) ||
    errorMessage.includes(code)
  );
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: any;
  let delay = opts.initialDelay;

  for (let attempt = 1; attempt <= opts.maxRetries; attempt++) {
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Operation timeout')), opts.timeout);
      });

      const result = await Promise.race([
        operation(),
        timeoutPromise
      ]);

      return result;
    } catch (error: any) {
      lastError = error;

      const isRetryable = isRetryableError(error, opts.retryableErrors);

      if (!isRetryable || attempt === opts.maxRetries) {
        logError(`Database operation failed after ${attempt} attempts`, {
          error: error.message,
          code: error.code,
          detail: error.detail,
          attempt
        });
        throw new DatabaseError(
          error.message || 'Database operation failed',
          error.code,
          error.detail,
          isRetryable
        );
      }

      logInfo(`Retrying database operation (attempt ${attempt}/${opts.maxRetries})`, {
        error: error.message,
        code: error.code,
        delay
      });

      await sleep(delay);

      delay = Math.min(delay * opts.backoffMultiplier, opts.maxDelay);
    }
  }

  throw lastError;
}

export async function withTransaction<T>(
  operation: (client: any) => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  return withRetry(async () => {
    const client = await (db as any).pool().connect();

    try {
      await client.query('BEGIN');

      const result = await operation(client);

      await client.query('COMMIT');

      return result;
    } catch (error: any) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }, options);
}

export async function acquireAdvisoryLock(
  lockId: number,
  timeout: number = 5000
): Promise<boolean> {
  try {
    const result = await db.one(
      'SELECT pg_try_advisory_lock($1) as acquired',
      [lockId]
    );
    return result.acquired;
  } catch (error: any) {
    logError('Failed to acquire advisory lock', { lockId, error: error.message });
    return false;
  }
}

export async function releaseAdvisoryLock(lockId: number): Promise<void> {
  try {
    await db.none('SELECT pg_advisory_unlock($1)', [lockId]);
  } catch (error: any) {
    logError('Failed to release advisory lock', { lockId, error: error.message });
  }
}

export async function withAdvisoryLock<T>(
  lockId: number,
  operation: () => Promise<T>,
  timeout: number = 5000
): Promise<T> {
  const acquired = await acquireAdvisoryLock(lockId, timeout);

  if (!acquired) {
    throw new DatabaseError('Could not acquire advisory lock', 'LOCK_TIMEOUT');
  }

  try {
    return await operation();
  } finally {
    await releaseAdvisoryLock(lockId);
  }
}

export async function batchOperation<T, R>(
  items: T[],
  operation: (batch: T[]) => Promise<R[]>,
  batchSize: number = 100
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await withRetry(() => operation(batch));
    results.push(...batchResults);

    if (i + batchSize < items.length) {
      await sleep(100);
    }
  }

  return results;
}

export interface ConnectionPoolStats {
  totalCount: number;
  idleCount: number;
  waitingCount: number;
  activeCount: number;
  utilizationPercent: number;
}

export async function getPoolStats(): Promise<ConnectionPoolStats> {
  const stats = db.getPoolStatus();
  const activeCount = stats.totalCount - stats.idleCount;
  const utilizationPercent = stats.totalCount > 0
    ? Math.round((activeCount / stats.totalCount) * 100)
    : 0;

  return {
    ...stats,
    activeCount,
    utilizationPercent
  };
}

export async function checkDatabaseHealth(timeout: number = 5000): Promise<{
  healthy: boolean;
  latency?: number;
  error?: string;
  poolStats?: ConnectionPoolStats;
}> {
  const startTime = Date.now();

  try {
    const healthy = await db.healthCheck(timeout);
    const latency = Date.now() - startTime;
    const poolStats = await getPoolStats();

    return {
      healthy,
      latency,
      poolStats
    };
  } catch (error: any) {
    return {
      healthy: false,
      latency: Date.now() - startTime,
      error: error.message
    };
  }
}

export async function withDeadlockRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 5
): Promise<T> {
  return withRetry(operation, {
    maxRetries,
    initialDelay: Math.random() * 100 + 50,
    backoffMultiplier: 1.5,
    retryableErrors: ['40P01', '40001', '55P03']
  });
}

export async function preventBuildTimeQuery<T>(
  operation: () => Promise<T>,
  fallback: T
): Promise<T> {
  if (process.env.VERCEL_ENV === 'production' && !process.env.BUILD_TIME_SKIP) {
    logInfo('Skipping database operation during build time');
    return fallback;
  }

  if (typeof window === 'undefined' && process.env.NODE_ENV === 'production') {
    const phase = (process as any).env.__NEXT_PHASE;
    if (phase === 'phase-production-build') {
      logInfo('Skipping database operation during Next.js build phase');
      return fallback;
    }
  }

  return operation();
}