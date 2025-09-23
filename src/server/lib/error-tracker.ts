import { logError, logWarn, logInfo } from '@/lib/log';
import { db } from '@/server/db';
import { withRetry } from './db-utils';

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum ErrorCategory {
  DATABASE = 'database',
  API = 'api',
  AUTHENTICATION = 'authentication',
  VALIDATION = 'validation',
  INTEGRATION = 'integration',
  SYSTEM = 'system',
  UNKNOWN = 'unknown'
}

export interface ErrorContext {
  userId?: string;
  agencyId?: string;
  callId?: string;
  endpoint?: string;
  method?: string;
  statusCode?: number;
  requestId?: string;
  [key: string]: any;
}

export interface TrackedError {
  id?: string;
  timestamp: Date;
  message: string;
  stack?: string;
  code?: string;
  severity: ErrorSeverity;
  category: ErrorCategory;
  context?: ErrorContext;
  resolved?: boolean;
  resolvedAt?: Date;
  notes?: string;
}

class ErrorTracker {
  private static instance: ErrorTracker;
  private errorBuffer: TrackedError[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  private errorCounts: Map<string, number> = new Map();
  private lastFlush: Date = new Date();

  private constructor() {
    this.startFlushInterval();
  }

  static getInstance(): ErrorTracker {
    if (!ErrorTracker.instance) {
      ErrorTracker.instance = new ErrorTracker();
    }
    return ErrorTracker.instance;
  }

  private startFlushInterval(): void {
    this.flushInterval = setInterval(() => {
      this.flush().catch(err => {
        console.error('Failed to flush error buffer:', err);
      });
    }, 30000);
  }

  async trackError(
    error: Error | any,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    category: ErrorCategory = ErrorCategory.UNKNOWN,
    context?: ErrorContext
  ): Promise<void> {
    const trackedError: TrackedError = {
      timestamp: new Date(),
      message: error.message || String(error),
      stack: error.stack,
      code: error.code,
      severity,
      category,
      context,
      resolved: false
    };

    this.errorBuffer.push(trackedError);

    const errorKey = `${category}:${error.code || 'unknown'}`;
    this.errorCounts.set(errorKey, (this.errorCounts.get(errorKey) || 0) + 1);

    if (severity === ErrorSeverity.CRITICAL) {
      logError('CRITICAL ERROR', { error: trackedError });
      await this.flush();
    } else if (severity === ErrorSeverity.HIGH) {
      logError('High severity error', { error: trackedError });
    } else if (severity === ErrorSeverity.MEDIUM) {
      logWarn('Medium severity error', { error: trackedError });
    } else {
      logInfo('Low severity error', { error: trackedError });
    }

    if (this.errorBuffer.length >= 50) {
      await this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.errorBuffer.length === 0) {
      return;
    }

    const errors = [...this.errorBuffer];
    this.errorBuffer = [];
    this.lastFlush = new Date();

    try {
      await this.persistErrors(errors);
    } catch (error) {
      logError('Failed to persist errors to database', { error });
      this.errorBuffer.unshift(...errors);
    }
  }

  private async persistErrors(errors: TrackedError[]): Promise<void> {
    try {
      await withRetry(async () => {
        const query = `
          INSERT INTO error_logs (
            timestamp, message, stack, code, severity,
            category, context, resolved
          ) VALUES ${errors.map((_, i) =>
            `($${i * 8 + 1}, $${i * 8 + 2}, $${i * 8 + 3}, $${i * 8 + 4},
              $${i * 8 + 5}, $${i * 8 + 6}, $${i * 8 + 7}::jsonb, $${i * 8 + 8})`
          ).join(', ')}
          ON CONFLICT DO NOTHING
        `;

        const params = errors.flatMap(error => [
          error.timestamp,
          error.message,
          error.stack || null,
          error.code || null,
          error.severity,
          error.category,
          JSON.stringify(error.context || {}),
          error.resolved || false
        ]);

        await db.none(query, params);
      });
    } catch (error) {
      await this.createErrorLogsTableIfNotExists();
    }
  }

  private async createErrorLogsTableIfNotExists(): Promise<void> {
    try {
      await db.none(`
        CREATE TABLE IF NOT EXISTS error_logs (
          id SERIAL PRIMARY KEY,
          timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          message TEXT NOT NULL,
          stack TEXT,
          code VARCHAR(50),
          severity VARCHAR(20) NOT NULL,
          category VARCHAR(50) NOT NULL,
          context JSONB,
          resolved BOOLEAN DEFAULT FALSE,
          resolved_at TIMESTAMPTZ,
          notes TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          INDEX idx_error_logs_timestamp (timestamp DESC),
          INDEX idx_error_logs_severity (severity),
          INDEX idx_error_logs_category (category),
          INDEX idx_error_logs_resolved (resolved)
        )
      `);
    } catch (error) {
      logError('Failed to create error_logs table', { error });
    }
  }

  getErrorCounts(): Map<string, number> {
    return new Map(this.errorCounts);
  }

  getBufferSize(): number {
    return this.errorBuffer.length;
  }

  getLastFlushTime(): Date {
    return this.lastFlush;
  }

  async getRecentErrors(
    limit: number = 100,
    severity?: ErrorSeverity,
    category?: ErrorCategory
  ): Promise<TrackedError[]> {
    try {
      let query = `
        SELECT * FROM error_logs
        WHERE 1=1
      `;
      const params: any[] = [];

      if (severity) {
        params.push(severity);
        query += ` AND severity = $${params.length}`;
      }

      if (category) {
        params.push(category);
        query += ` AND category = $${params.length}`;
      }

      params.push(limit);
      query += ` ORDER BY timestamp DESC LIMIT $${params.length}`;

      const results = await db.manyOrNone(query, params);
      return results;
    } catch (error) {
      logError('Failed to get recent errors', { error });
      return [];
    }
  }

  async getErrorStats(hours: number = 24): Promise<{
    total: number;
    bySeverity: Record<string, number>;
    byCategory: Record<string, number>;
    topErrors: Array<{ message: string; count: number }>;
  }> {
    try {
      const since = new Date(Date.now() - hours * 60 * 60 * 1000);

      const stats = await db.one(`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE severity = 'critical') as critical,
          COUNT(*) FILTER (WHERE severity = 'high') as high,
          COUNT(*) FILTER (WHERE severity = 'medium') as medium,
          COUNT(*) FILTER (WHERE severity = 'low') as low
        FROM error_logs
        WHERE timestamp >= $1
      `, [since]);

      const categoryStats = await db.manyOrNone(`
        SELECT category, COUNT(*) as count
        FROM error_logs
        WHERE timestamp >= $1
        GROUP BY category
        ORDER BY count DESC
      `, [since]);

      const topErrors = await db.manyOrNone(`
        SELECT message, COUNT(*) as count
        FROM error_logs
        WHERE timestamp >= $1
        GROUP BY message
        ORDER BY count DESC
        LIMIT 10
      `, [since]);

      return {
        total: parseInt(stats.total),
        bySeverity: {
          critical: parseInt(stats.critical),
          high: parseInt(stats.high),
          medium: parseInt(stats.medium),
          low: parseInt(stats.low)
        },
        byCategory: categoryStats.reduce((acc, { category, count }) => {
          acc[category] = parseInt(count);
          return acc;
        }, {} as Record<string, number>),
        topErrors: topErrors.map(({ message, count }) => ({
          message,
          count: parseInt(count)
        }))
      };
    } catch (error) {
      logError('Failed to get error stats', { error });
      return {
        total: 0,
        bySeverity: {},
        byCategory: {},
        topErrors: []
      };
    }
  }

  stop(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    this.flush().catch(err => {
      console.error('Failed to flush error buffer on stop:', err);
    });
  }
}

export const errorTracker = ErrorTracker.getInstance();

export function categorizeError(error: any): ErrorCategory {
  const message = error.message || '';
  const code = error.code || '';

  if (code.startsWith('4') || message.includes('deadlock') || message.includes('database')) {
    return ErrorCategory.DATABASE;
  }

  if (code === '401' || code === '403' || message.includes('auth')) {
    return ErrorCategory.AUTHENTICATION;
  }

  if (message.includes('validation') || message.includes('invalid')) {
    return ErrorCategory.VALIDATION;
  }

  if (message.includes('API') || message.includes('fetch') || message.includes('network')) {
    return ErrorCategory.API;
  }

  if (message.includes('Convoso') || message.includes('Deepgram') || message.includes('OpenAI')) {
    return ErrorCategory.INTEGRATION;
  }

  if (message.includes('memory') || message.includes('timeout') || message.includes('SIGTERM')) {
    return ErrorCategory.SYSTEM;
  }

  return ErrorCategory.UNKNOWN;
}

export function determineErrorSeverity(error: any): ErrorSeverity {
  const message = error.message || '';
  const code = error.code || '';

  if (
    code === '40P01' ||
    message.includes('deadlock') ||
    message.includes('CRITICAL') ||
    message.includes('FATAL')
  ) {
    return ErrorSeverity.CRITICAL;
  }

  if (
    code.startsWith('5') ||
    message.includes('database') ||
    message.includes('connection') ||
    message.includes('timeout')
  ) {
    return ErrorSeverity.HIGH;
  }

  if (
    code.startsWith('4') ||
    message.includes('not found') ||
    message.includes('invalid')
  ) {
    return ErrorSeverity.MEDIUM;
  }

  return ErrorSeverity.LOW;
}

export async function trackApiError(
  error: any,
  request: Request,
  context?: ErrorContext
): Promise<void> {
  const severity = determineErrorSeverity(error);
  const category = categorizeError(error);

  await errorTracker.trackError(error, severity, category, {
    ...context,
    endpoint: new URL(request.url).pathname,
    method: request.method,
    statusCode: error.statusCode
  });
}

process.on('SIGTERM', () => {
  errorTracker.stop();
});

process.on('SIGINT', () => {
  errorTracker.stop();
});