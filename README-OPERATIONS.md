# Operations & Monitoring Guide

## Overview

This document provides comprehensive documentation for the production-ready operational monitoring system implemented for SyncedUp Call AI. The system includes health checks, metrics collection, error tracking, alerting, and an operational dashboard.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Architecture Overview](#architecture-overview)
3. [API Endpoints](#api-endpoints)
4. [Operational Dashboard](#operational-dashboard)
5. [Error Tracking](#error-tracking)
6. [Alerting System](#alerting-system)
7. [Database Utilities](#database-utilities)
8. [Environment Variables](#environment-variables)
9. [Deployment Checklist](#deployment-checklist)
10. [Troubleshooting](#troubleshooting)

## Quick Start

### Testing the System

```bash
# Run comprehensive operations test
node test-operations.mjs

# Check system health
curl http://localhost:3000/api/health

# View system status
curl http://localhost:3000/api/status

# Access dashboard
open http://localhost:3000/admin/operations
```

### Key URLs

- **Operations Dashboard**: `/admin/operations`
- **Health Check**: `/api/health`
- **System Status**: `/api/status`
- **System Metrics**: `/api/metrics/system`
- **Job Metrics**: `/api/metrics/jobs`
- **Error Metrics**: `/api/metrics/errors`

## Architecture Overview

The monitoring system consists of several interconnected components:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │
│  Health Check   │────▶│  Status API     │────▶│   Dashboard     │
│   Endpoint      │     │   Endpoint      │     │      UI         │
│                 │     │                 │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│                      Metrics Collection Layer                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │
│  Error Tracker  │     │  Alert Manager  │     │   DB Utils      │
│                 │     │                 │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

## API Endpoints

### Health Check Endpoint

**GET** `/api/health`

Provides comprehensive health information about the system.

**Response:**
```json
{
  "status": "healthy|degraded|unhealthy",
  "timestamp": "2024-01-01T00:00:00Z",
  "services": {
    "database": {
      "status": "healthy",
      "latency": 12,
      "details": { /* connection pool stats */ }
    },
    "deepgram": { "status": "healthy", "latency": 150 },
    "openai": { "status": "healthy", "latency": 200 },
    "convoso": { "status": "healthy", "latency": 180 }
  },
  "queue": {
    "pending": 10,
    "processing": 2,
    "failed": 0,
    "completed_last_hour": 45
  },
  "errors": {
    "last_hour": 3,
    "critical_count": 0,
    "buffer_size": 0
  },
  "environment": {
    "node_env": "production",
    "vercel_env": "production",
    "commit_sha": "abc123"
  },
  "resources": {
    "memory": {
      "used_mb": 256,
      "total_mb": 512,
      "percent": 50
    },
    "pool": {
      "utilization": 20
    }
  }
}
```

### System Status Endpoint

**GET** `/api/status`

Provides operational status overview and active issues.

**Response:**
```json
{
  "status": "operational|degraded|outage",
  "timestamp": "2024-01-01T00:00:00Z",
  "uptime": {
    "seconds": 86400,
    "formatted": "1d 0h 0m"
  },
  "services": {
    "database": { /* connection info */ },
    "queues": { /* queue statistics */ },
    "external_apis": { /* API statuses */ }
  },
  "performance": {
    "avg_response_time_ms": 145,
    "requests_per_minute": 120,
    "error_rate": 0.002
  },
  "issues": [
    {
      "type": "warning",
      "message": "High queue backlog detected"
    }
  ],
  "recent_activity": { /* last hour stats */ }
}
```

### System Metrics Endpoint

**GET** `/api/metrics/system`

Returns detailed system performance metrics.

### Job Metrics Endpoint

**GET** `/api/metrics/jobs`

Returns metrics about job processing queues.

### Error Metrics Endpoint

**GET** `/api/metrics/errors`

Returns error statistics and trends.

## Operational Dashboard

The operational dashboard is available at `/admin/operations` and provides:

- **Real-time System Status**: Overall health indicator
- **Service Health Monitoring**: Status of all critical services
- **Queue Status**: Recording and transcription queue statistics
- **Performance Metrics**: Response times and request rates
- **Active Issues**: Current problems requiring attention
- **Recent Activity**: Processing statistics for the last hour
- **Resource Usage**: Memory and connection pool utilization

### Features

- **Auto-refresh**: Updates every 30 seconds
- **Visual Indicators**: Color-coded status badges
- **Quick Actions**: Direct links to detailed metrics
- **Mobile Responsive**: Works on all screen sizes

## Error Tracking

The error tracking system (`src/server/lib/error-tracker.ts`) provides:

### Features

- **Automatic Error Capture**: All errors are tracked automatically
- **Severity Classification**: Errors are categorized by severity (LOW, MEDIUM, HIGH, CRITICAL)
- **Category Organization**: Errors are grouped by type (DATABASE, API, AUTHENTICATION, etc.)
- **Buffer System**: Errors are buffered and batch-persisted to reduce database load
- **Statistics API**: Query error trends and patterns

### Usage

```typescript
import { errorTracker, ErrorSeverity, ErrorCategory } from '@/server/lib/error-tracker';

// Track an error
await errorTracker.trackError(
  error,
  ErrorSeverity.HIGH,
  ErrorCategory.DATABASE,
  { userId, endpoint }
);

// Get error statistics
const stats = await errorTracker.getErrorStats(24); // Last 24 hours
```

## Alerting System

The alerting system (`src/server/lib/alert-manager.ts`) monitors system health and triggers alerts.

### Built-in Alert Rules

1. **Database Health**: Monitors database connectivity
2. **High Error Rate**: Triggers when errors exceed threshold
3. **Queue Backlog**: Detects excessive pending items
4. **API Degradation**: Monitors response times
5. **Memory Usage**: Alerts on high memory consumption

### Alert Channels

- **Log**: Writes to application logs
- **Email**: Sends email notifications (requires SendGrid)
- **Webhook**: Posts to external URLs
- **Database**: Persists alerts for audit trail

### Configuration

```typescript
import { alertManager, AlertLevel, AlertChannel } from '@/server/lib/alert-manager';

// Add custom alert rule
alertManager.addRule({
  id: 'custom_rule',
  name: 'Custom Alert',
  condition: async () => {
    // Return true to trigger alert
    return checkSomeCondition();
  },
  level: AlertLevel.WARNING,
  message: (context) => `Alert message: ${context.value}`,
  channels: [AlertChannel.LOG, AlertChannel.EMAIL],
  cooldownMinutes: 30
});
```

## Database Utilities

The database utilities module (`src/server/lib/db-utils.ts`) provides:

### Features

- **Automatic Retry Logic**: Retries failed queries with exponential backoff
- **Deadlock Prevention**: Handles deadlock errors gracefully
- **Connection Pool Management**: Monitors and reports pool statistics
- **Transaction Support**: Safe transaction handling with automatic rollback
- **Advisory Locks**: PostgreSQL advisory locks for distributed operations
- **Batch Operations**: Process large datasets efficiently

### Usage

```typescript
import { withRetry, withTransaction, withDeadlockRetry } from '@/server/lib/db-utils';

// Retry a database operation
const result = await withRetry(
  () => db.query('SELECT * FROM calls'),
  { maxRetries: 5, initialDelay: 100 }
);

// Handle deadlock-prone operations
const data = await withDeadlockRetry(
  () => updateRecordWithLocking(id)
);

// Safe transaction
const outcome = await withTransaction(async (client) => {
  await client.query('UPDATE calls SET status = $1', ['processing']);
  await client.query('INSERT INTO logs ...', [...]);
  return { success: true };
});
```

## Environment Variables

### Required for Basic Operation

```bash
# Database
DATABASE_URL=postgresql://...

# API Services
DEEPGRAM_API_KEY=...
OPENAI_API_KEY=...
CONVOSO_AUTH_TOKEN=...
```

### Optional for Enhanced Monitoring

```bash
# Alerting
ALERT_EMAIL_TO=admin@example.com
ALERT_EMAIL_FROM=alerts@example.com
SENDGRID_API_KEY=...
ALERT_WEBHOOK_URL=https://...
ALERT_WEBHOOK_SECRET=...

# Monitoring
APP_URL=https://your-app.com
VERCEL_ENV=production
```

## Deployment Checklist

### Pre-Deployment

- [ ] Set all required environment variables
- [ ] Test health endpoints locally
- [ ] Verify database connection pooling settings
- [ ] Configure alert channels if needed
- [ ] Review error tracking configuration

### Deployment

- [ ] Deploy code to staging first
- [ ] Run `node test-operations.mjs` against staging
- [ ] Monitor health endpoint during deployment
- [ ] Check for any database migration needs
- [ ] Verify all services are healthy

### Post-Deployment

- [ ] Access operations dashboard
- [ ] Verify all metrics are being collected
- [ ] Check error logs for any issues
- [ ] Test alert system (if configured)
- [ ] Monitor for 15 minutes for stability

## Troubleshooting

### Common Issues

#### Database Deadlocks

**Symptoms**: Timeout errors, stuck transactions

**Solution**:
1. Check `/api/metrics/jobs` for stuck items
2. Review connection pool usage in `/api/health`
3. Database operations automatically retry with the new utilities

#### High Memory Usage

**Symptoms**: Slow response times, crashes

**Solution**:
1. Check memory usage in `/api/metrics/system`
2. Review error buffer size in `/api/metrics/errors`
3. Increase memory limits or optimize queries

#### Service Degradation

**Symptoms**: Slow API responses, failed external calls

**Solution**:
1. Check `/api/status` for service health
2. Review `/api/metrics/errors` for patterns
3. Check external API status pages

### Debug Commands

```bash
# Check database connections
psql $DATABASE_URL -c "SELECT * FROM pg_stat_activity;"

# View recent errors
curl http://localhost:3000/api/metrics/errors | jq '.recent_critical'

# Test specific service
curl http://localhost:3000/api/health | jq '.services.deepgram'

# Force garbage collection (if needed)
node --expose-gc -e "global.gc()"
```

### Log Locations

- **Application Logs**: Check Vercel Functions logs
- **Error Logs**: Stored in `error_logs` table
- **Alert History**: Stored in `alerts` table
- **API Logs**: Stored in `api_logs` table (if configured)

## Performance Optimization Tips

1. **Connection Pooling**: Keep pool size between 10-20 connections
2. **Error Buffer**: Flush size set to 50 errors
3. **Alert Cooldown**: Minimum 5 minutes between same alerts
4. **Health Check Cache**: No caching to ensure real-time data
5. **Dashboard Refresh**: 30-second intervals to balance load

## Security Considerations

1. **Authentication**: Dashboard requires admin access
2. **Rate Limiting**: Consider adding rate limits to metrics endpoints
3. **Sensitive Data**: Never log credentials or PII
4. **CORS**: Configure appropriately for production
5. **Webhook Secrets**: Always use webhook authentication

## Next Steps

1. **Set up external monitoring**: Use services like UptimeRobot or Pingdom
2. **Configure log aggregation**: Consider services like Datadog or New Relic
3. **Implement APM**: Add Application Performance Monitoring
4. **Create runbooks**: Document response procedures for common issues
5. **Set up PagerDuty**: For critical alert escalation

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review error logs in the dashboard
3. Examine the test suite output
4. Contact the development team

---

*Last Updated: January 2024*
*Version: 1.0.0*