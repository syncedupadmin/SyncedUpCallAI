# Super Admin Portal Audit System Documentation

## Overview
The Super Admin Portal Audit System provides comprehensive monitoring, security scanning, and health checks for the SyncedUp Call AI platform. This system ensures 100% operational functionality of all super admin features with real-time monitoring capabilities.

## Table of Contents
1. [System Architecture](#system-architecture)
2. [API Endpoints](#api-endpoints)
3. [Audit Categories](#audit-categories)
4. [Security Features](#security-features)
5. [Health Monitoring](#health-monitoring)
6. [UI Dashboard](#ui-dashboard)
7. [Deployment & Configuration](#deployment--configuration)
8. [Troubleshooting](#troubleshooting)

## System Architecture

### Components
```
┌─────────────────────────────────────────────┐
│         Super Admin Portal Audit System      │
├─────────────────────────────────────────────┤
│                                               │
│  ┌──────────────┐     ┌──────────────┐      │
│  │   UI Dashboard│     │  API Routes  │      │
│  │              │────>│              │       │
│  │  /superadmin │     │  /api/admin/ │       │
│  │  /audit-     │     │  portal-audit│       │
│  │  dashboard   │     │  portal-health│      │
│  └──────────────┘     └──────────────┘      │
│                              │                │
│                              ▼                │
│                    ┌──────────────┐          │
│                    │   Database   │          │
│                    │   (Supabase) │          │
│                    └──────────────┘          │
└─────────────────────────────────────────────┘
```

### File Structure
```
src/
├── app/
│   ├── api/
│   │   └── admin/
│   │       ├── portal-audit/
│   │       │   └── route.ts       # Main audit endpoint
│   │       └── portal-health/
│   │           └── route.ts       # Real-time health monitoring
│   └── superadmin/
│       └── audit-dashboard/
│           └── page.tsx           # UI Dashboard
└── components/
    └── SuperAdminNav.tsx         # Navigation with audit link
```

## API Endpoints

### 1. Portal Audit Endpoint
**Route:** `/api/admin/portal-audit`

#### POST - Run Full Audit
```typescript
// Request
POST /api/admin/portal-audit
Headers: {
  'Content-Type': 'application/json',
  'Cookie': 'su_admin=true' // Required authentication
}

// Response
{
  "overallStatus": "healthy" | "degraded" | "critical",
  "timestamp": "2024-01-20T12:00:00Z",
  "duration": 1523,
  "results": [
    {
      "category": "Authentication",
      "test": "Supabase Auth Service",
      "status": "pass" | "fail" | "warning",
      "message": "Auth service is responsive",
      "details": {...},
      "timestamp": "2024-01-20T12:00:00Z"
    }
  ],
  "summary": {
    "total": 45,
    "passed": 42,
    "failed": 1,
    "warnings": 2,
    "healthScore": 92
  }
}
```

#### GET - Retrieve Latest Audit
```typescript
// Request
GET /api/admin/portal-audit

// Response
{
  "id": "uuid",
  "overall_status": "healthy",
  "timestamp": "2024-01-20T12:00:00Z",
  "results": {...},
  "summary": {...}
}
```

### 2. Portal Health Endpoint
**Route:** `/api/admin/portal-health`

#### GET - Real-time Health Metrics
```typescript
// Request
GET /api/admin/portal-health

// Response
{
  "timestamp": "2024-01-20T12:00:00Z",
  "status": "healthy",
  "uptime": 86400,
  "metrics": {
    "cpu": {
      "name": "Query Performance",
      "value": 45,
      "unit": "ms avg",
      "status": "healthy"
    },
    "memory": {
      "name": "Estimated Memory",
      "value": 256,
      "unit": "MB",
      "status": "healthy"
    },
    "database": {...},
    "apiLatency": {...},
    "activeUsers": {...},
    "errorRate": {...},
    "queueSize": {...},
    "cacheHitRate": {...}
  },
  "recentErrors": [...],
  "activeAlerts": [...]
}
```

## Audit Categories

### 1. Authentication System
- Supabase Auth Service connectivity
- JWT token validation
- Active session monitoring
- Session expiry checks

### 2. Role-Based Access Control (RBAC)
- RLS policy verification
- Admin user count and permissions
- Role distribution analysis
- Permission consistency checks

### 3. API Endpoints
- Critical endpoint availability
- Response time monitoring
- Authentication verification
- Error rate tracking

### 4. Database Operations
- Connection pool status
- Query performance metrics
- Table size analysis
- Slow query detection
- Cache hit ratios

### 5. User Management
- User statistics (total, new, active)
- Data integrity checks
- Orphaned record detection
- Permission consistency

### 6. Settings & Configuration
- AI configuration status
- Environment variable validation
- Cron job monitoring
- Feature flag status

### 7. Security
- **Enhanced vulnerability scanning:**
  - Secret exposure detection (JWT, API keys, tokens)
  - Brute force attack monitoring
  - SQL injection protection verification
  - XSS vulnerability checks
  - Session security analysis
  - SSL/TLS configuration
  - Rate limiting status
  - Audit logging verification
  - Password policy compliance
  - Dependency vulnerability warnings

### 8. Performance
- Database query performance
- API response times
- Cache efficiency
- Connection pool utilization
- Memory usage estimation

## Security Features

### Vulnerability Scanning
The system includes comprehensive security scanning:

1. **Secret Detection Patterns:**
   - JWT tokens
   - Stripe API keys
   - Google API keys
   - GitHub personal tokens
   - Custom patterns

2. **Attack Detection:**
   - Brute force login attempts
   - Suspicious IP patterns
   - Failed authentication tracking
   - Bot detection

3. **Protection Verification:**
   - SQL injection testing
   - XSS prevention checks
   - CSRF protection
   - Rate limiting validation

### Audit Logging
All audit operations are logged with:
- Timestamp
- User identification
- Action performed
- Results summary
- Error details (if any)

## Health Monitoring

### Real-time Metrics
The health monitoring system tracks:

1. **System Resources:**
   - CPU usage (via query performance)
   - Memory estimation
   - Database connections
   - Cache efficiency

2. **Application Health:**
   - API response times
   - Active user sessions
   - Error rates
   - Queue sizes

3. **Alerts System:**
   - Critical: Immediate action required
   - Warning: Monitor closely
   - Info: Informational only

### Monitoring Thresholds
```typescript
const thresholds = {
  database: { warning: 100, critical: 500 },    // ms
  apiLatency: { warning: 200, critical: 1000 }, // ms
  errorRate: { warning: 10, critical: 50 },     // per hour
  queueSize: { warning: 100, critical: 500 },   // items
  cacheHitRate: { warning: 90, critical: 75 }   // percentage
}
```

## UI Dashboard

### Features
1. **Control Panel:**
   - Run full audit on-demand
   - Auto-refresh toggle (1-minute intervals)
   - Export audit reports (JSON format)

2. **Status Overview:**
   - Overall system status (healthy/degraded/critical)
   - Health score (0-100%)
   - Pass/fail/warning counts
   - Last audit timestamp

3. **Category Filters:**
   - View all results
   - Filter by category
   - Category-specific statistics

4. **Detailed Results:**
   - Individual test results
   - Expandable details
   - Timestamp for each test
   - Color-coded status indicators

### Navigation
Access the audit dashboard at: `/superadmin/audit-dashboard`

The dashboard is integrated into the Super Admin navigation menu with a "Shield Check" icon.

## Deployment & Configuration

### Environment Variables
Required for full functionality:
```env
# Database
DATABASE_URL=postgresql://...
NEXT_PUBLIC_SUPABASE_URL=https://...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# AI Services
DEEPGRAM_API_KEY=...
OPENAI_API_KEY=...

# Security
JOBS_SECRET=...
CRON_SECRET=...
RATE_LIMIT_ENABLED=true
HSTS_ENABLED=true

# Application
APP_URL=https://your-domain.com
NODE_ENV=production
```

### Database Tables
The system automatically creates the `portal_audits` table:
```sql
CREATE TABLE IF NOT EXISTS portal_audits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  overall_status TEXT,
  timestamp TIMESTAMP WITH TIME ZONE,
  duration INTEGER,
  results JSONB,
  summary JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Vercel Configuration
For production deployment on Vercel:
1. Set all required environment variables
2. Ensure SSL is enabled (automatic with Vercel)
3. Configure cron jobs for automated audits (optional)

## Troubleshooting

### Common Issues & Solutions

#### 1. Authentication Failures
**Issue:** "Unauthorized" error when accessing audit endpoints
**Solution:**
- Verify user has super admin role
- Check `su_admin` cookie is set
- Ensure Supabase auth is configured correctly

#### 2. Database Connection Errors
**Issue:** "Database audit failed" in results
**Solution:**
- Verify `DATABASE_URL` is correct
- Check SSL configuration for Supabase
- Ensure connection pool isn't exhausted

#### 3. Slow Audit Performance
**Issue:** Audit takes > 30 seconds
**Solution:**
- Check database performance metrics
- Review slow queries in audit results
- Consider increasing `maxDuration` in route config

#### 4. Missing Audit Data
**Issue:** "No audits found" message
**Solution:**
- Run a full audit first (POST to `/api/admin/portal-audit`)
- Check if `portal_audits` table exists
- Verify database write permissions

### Debug Mode
Enable debug logging by setting:
```typescript
const DEBUG = process.env.NODE_ENV === 'development';
```

This will provide detailed console output for troubleshooting.

## Best Practices

1. **Regular Audits:**
   - Run full audits at least daily
   - Enable auto-refresh during critical operations
   - Export and archive audit reports weekly

2. **Alert Response:**
   - Critical alerts: Immediate investigation required
   - Warning alerts: Schedule investigation within 24 hours
   - Monitor trends over time

3. **Security:**
   - Review security audit results daily
   - Investigate all failed authentication attempts
   - Keep dependencies updated (npm audit)

4. **Performance:**
   - Monitor cache hit ratios (target > 90%)
   - Investigate slow queries (> 100ms average)
   - Track API response times

## API Usage Examples

### Running an Audit (JavaScript)
```javascript
async function runPortalAudit() {
  const response = await fetch('/api/admin/portal-audit', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'include'
  });

  if (!response.ok) {
    throw new Error('Audit failed');
  }

  const audit = await response.json();
  console.log('Audit completed:', audit.summary);
  return audit;
}
```

### Monitoring Health (React Hook)
```typescript
import { useState, useEffect } from 'react';

function useHealthMonitoring(interval = 5000) {
  const [health, setHealth] = useState(null);

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const res = await fetch('/api/admin/portal-health');
        const data = await res.json();
        setHealth(data);
      } catch (error) {
        console.error('Health check failed:', error);
      }
    };

    fetchHealth();
    const timer = setInterval(fetchHealth, interval);
    return () => clearInterval(timer);
  }, [interval]);

  return health;
}
```

## Version History
- **v1.0.0** - Initial release with comprehensive audit system
- **v1.1.0** - Enhanced security vulnerability scanning
- **v1.2.0** - Real-time health monitoring added
- **v1.3.0** - UI dashboard with auto-refresh and export features

## Support
For issues or questions regarding the Super Admin Portal Audit System:
1. Check this documentation
2. Review audit results for specific error messages
3. Check system logs in Vercel dashboard
4. Contact system administrator with audit report export