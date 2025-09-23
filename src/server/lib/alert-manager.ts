import { errorTracker, ErrorSeverity } from './error-tracker';
import { checkDatabaseHealth } from './db-utils';
import { db } from '@/server/db';
import { logError, logWarn, logInfo } from '@/lib/log';

export enum AlertLevel {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical'
}

export enum AlertChannel {
  EMAIL = 'email',
  WEBHOOK = 'webhook',
  LOG = 'log',
  DATABASE = 'database'
}

export interface Alert {
  id?: string;
  level: AlertLevel;
  title: string;
  message: string;
  context?: Record<string, any>;
  channels: AlertChannel[];
  timestamp: Date;
  resolved?: boolean;
  resolvedAt?: Date;
  notificationsSent?: string[];
}

export interface AlertRule {
  id: string;
  name: string;
  description?: string;
  condition: () => Promise<boolean>;
  level: AlertLevel;
  message: (context?: any) => string;
  channels: AlertChannel[];
  cooldownMinutes?: number;
  enabled?: boolean;
}

class AlertManager {
  private static instance: AlertManager;
  private rules: Map<string, AlertRule> = new Map();
  private lastAlertTimes: Map<string, Date> = new Map();
  private activeAlerts: Map<string, Alert> = new Map();
  private checkInterval: NodeJS.Timeout | null = null;

  private constructor() {
    this.initializeDefaultRules();
    this.startMonitoring();
  }

  static getInstance(): AlertManager {
    if (!AlertManager.instance) {
      AlertManager.instance = new AlertManager();
    }
    return AlertManager.instance;
  }

  private initializeDefaultRules() {
    this.addRule({
      id: 'database_health',
      name: 'Database Health Check',
      description: 'Monitors database connectivity and response time',
      condition: async () => {
        const health = await checkDatabaseHealth();
        return !health.healthy || (health.latency && health.latency > 5000);
      },
      level: AlertLevel.CRITICAL,
      message: (context) => `Database health check failed: ${context?.error || 'Unhealthy'}`,
      channels: [AlertChannel.LOG, AlertChannel.EMAIL],
      cooldownMinutes: 5
    });

    this.addRule({
      id: 'high_error_rate',
      name: 'High Error Rate',
      description: 'Triggers when error rate exceeds threshold',
      condition: async () => {
        const stats = await errorTracker.getErrorStats(1);
        return stats.total > 50 || (stats.bySeverity.critical || 0) > 0;
      },
      level: AlertLevel.ERROR,
      message: (context) => `High error rate detected: ${context?.errorCount || 'Unknown'} errors in the last hour`,
      channels: [AlertChannel.LOG, AlertChannel.WEBHOOK],
      cooldownMinutes: 15
    });

    this.addRule({
      id: 'queue_backlog',
      name: 'Queue Backlog',
      description: 'Monitors for excessive queue backlogs',
      condition: async () => {
        try {
          const result = await db.one(`
            SELECT
              (SELECT COUNT(*) FROM recording_queue WHERE status = 'pending') as pending,
              (SELECT COUNT(*) FROM recording_queue WHERE status = 'processing' AND updated_at < NOW() - INTERVAL '10 minutes') as stale
          `);
          return parseInt(result.pending) > 100 || parseInt(result.stale) > 5;
        } catch {
          return false;
        }
      },
      level: AlertLevel.WARNING,
      message: (context) => `Queue backlog detected: ${context?.pending || 0} pending, ${context?.stale || 0} stale items`,
      channels: [AlertChannel.LOG],
      cooldownMinutes: 30
    });

    this.addRule({
      id: 'api_degradation',
      name: 'API Performance Degradation',
      description: 'Monitors API response times and error rates',
      condition: async () => {
        try {
          const result = await db.one(`
            SELECT
              AVG(response_time_ms) as avg_response,
              COUNT(*) FILTER (WHERE status_code >= 500) as server_errors
            FROM api_logs
            WHERE timestamp > NOW() - INTERVAL '5 minutes'
          `);
          return parseFloat(result.avg_response || '0') > 3000 || parseInt(result.server_errors || '0') > 10;
        } catch {
          return false;
        }
      },
      level: AlertLevel.WARNING,
      message: (context) => `API performance degradation: ${context?.avgResponse || 0}ms avg response time`,
      channels: [AlertChannel.LOG],
      cooldownMinutes: 10
    });

    this.addRule({
      id: 'memory_usage',
      name: 'High Memory Usage',
      description: 'Triggers when memory usage exceeds 80%',
      condition: async () => {
        const memUsage = process.memoryUsage();
        const usagePercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
        return usagePercent > 80;
      },
      level: AlertLevel.WARNING,
      message: (context) => `High memory usage: ${context?.percent || 0}% of heap used`,
      channels: [AlertChannel.LOG],
      cooldownMinutes: 20
    });
  }

  addRule(rule: AlertRule) {
    this.rules.set(rule.id, { ...rule, enabled: rule.enabled !== false });
    logInfo(`Alert rule added: ${rule.name}`);
  }

  removeRule(ruleId: string) {
    this.rules.delete(ruleId);
    logInfo(`Alert rule removed: ${ruleId}`);
  }

  enableRule(ruleId: string) {
    const rule = this.rules.get(ruleId);
    if (rule) {
      rule.enabled = true;
    }
  }

  disableRule(ruleId: string) {
    const rule = this.rules.get(ruleId);
    if (rule) {
      rule.enabled = false;
    }
  }

  private startMonitoring() {
    this.checkInterval = setInterval(() => {
      this.checkAllRules().catch(err => {
        logError('Error checking alert rules', { error: err.message });
      });
    }, 60000);
  }

  private async checkAllRules() {
    for (const [ruleId, rule] of this.rules) {
      if (!rule.enabled) continue;

      try {
        const shouldAlert = await rule.condition();

        if (shouldAlert) {
          await this.triggerAlert(rule);
        } else {
          this.resolveAlert(ruleId);
        }
      } catch (error: any) {
        logError(`Error checking alert rule ${ruleId}`, { error: error.message });
      }
    }
  }

  private async triggerAlert(rule: AlertRule) {
    const lastAlertTime = this.lastAlertTimes.get(rule.id);
    const cooldownMs = (rule.cooldownMinutes || 60) * 60 * 1000;

    if (lastAlertTime && Date.now() - lastAlertTime.getTime() < cooldownMs) {
      return;
    }

    const alert: Alert = {
      level: rule.level,
      title: rule.name,
      message: rule.message(),
      channels: rule.channels,
      timestamp: new Date(),
      resolved: false
    };

    this.activeAlerts.set(rule.id, alert);
    this.lastAlertTimes.set(rule.id, new Date());

    await this.sendAlert(alert);

    await errorTracker.trackError(
      new Error(alert.message),
      this.levelToSeverity(alert.level),
      'alert',
      { ruleId: rule.id, alertTitle: alert.title }
    );
  }

  private resolveAlert(ruleId: string) {
    const activeAlert = this.activeAlerts.get(ruleId);
    if (activeAlert && !activeAlert.resolved) {
      activeAlert.resolved = true;
      activeAlert.resolvedAt = new Date();
      logInfo(`Alert resolved: ${activeAlert.title}`);
    }
  }

  private async sendAlert(alert: Alert) {
    const notifications: string[] = [];

    for (const channel of alert.channels) {
      try {
        switch (channel) {
          case AlertChannel.LOG:
            this.logAlert(alert);
            notifications.push('log');
            break;

          case AlertChannel.EMAIL:
            await this.sendEmailAlert(alert);
            notifications.push('email');
            break;

          case AlertChannel.WEBHOOK:
            await this.sendWebhookAlert(alert);
            notifications.push('webhook');
            break;

          case AlertChannel.DATABASE:
            await this.saveAlertToDatabase(alert);
            notifications.push('database');
            break;
        }
      } catch (error: any) {
        logError(`Failed to send alert via ${channel}`, { error: error.message });
      }
    }

    alert.notificationsSent = notifications;
  }

  private logAlert(alert: Alert) {
    const logMessage = `[ALERT] ${alert.title}: ${alert.message}`;

    switch (alert.level) {
      case AlertLevel.CRITICAL:
      case AlertLevel.ERROR:
        logError(logMessage, alert.context);
        break;
      case AlertLevel.WARNING:
        logWarn(logMessage, alert.context);
        break;
      default:
        logInfo(logMessage, alert.context);
    }
  }

  private async sendEmailAlert(alert: Alert) {
    if (!process.env.ALERT_EMAIL_TO || !process.env.SENDGRID_API_KEY) {
      logWarn('Email alerts not configured');
      return;
    }

    const emailContent = {
      to: process.env.ALERT_EMAIL_TO,
      from: process.env.ALERT_EMAIL_FROM || 'alerts@syncedupcallai.com',
      subject: `[${alert.level.toUpperCase()}] ${alert.title}`,
      text: alert.message,
      html: `
        <h2>${alert.title}</h2>
        <p><strong>Level:</strong> ${alert.level}</p>
        <p><strong>Time:</strong> ${alert.timestamp.toISOString()}</p>
        <p><strong>Message:</strong> ${alert.message}</p>
        ${alert.context ? `<pre>${JSON.stringify(alert.context, null, 2)}</pre>` : ''}
      `
    };

    try {
      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ personalizations: [{ to: [{ email: emailContent.to }] }], ...emailContent })
      });

      if (!response.ok) {
        throw new Error(`SendGrid API error: ${response.status}`);
      }
    } catch (error: any) {
      logError('Failed to send email alert', { error: error.message });
      throw error;
    }
  }

  private async sendWebhookAlert(alert: Alert) {
    if (!process.env.ALERT_WEBHOOK_URL) {
      logWarn('Webhook alerts not configured');
      return;
    }

    const payload = {
      level: alert.level,
      title: alert.title,
      message: alert.message,
      timestamp: alert.timestamp.toISOString(),
      context: alert.context
    };

    try {
      const response = await fetch(process.env.ALERT_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(process.env.ALERT_WEBHOOK_SECRET && {
            'X-Webhook-Secret': process.env.ALERT_WEBHOOK_SECRET
          })
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Webhook error: ${response.status}`);
      }
    } catch (error: any) {
      logError('Failed to send webhook alert', { error: error.message });
      throw error;
    }
  }

  private async saveAlertToDatabase(alert: Alert) {
    try {
      await db.none(`
        INSERT INTO alerts (
          level, title, message, context, channels,
          timestamp, resolved, resolved_at, notifications_sent
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        alert.level,
        alert.title,
        alert.message,
        JSON.stringify(alert.context || {}),
        alert.channels,
        alert.timestamp,
        alert.resolved || false,
        alert.resolvedAt || null,
        alert.notificationsSent || []
      ]);
    } catch (error: any) {
      await this.createAlertsTableIfNotExists();
    }
  }

  private async createAlertsTableIfNotExists() {
    try {
      await db.none(`
        CREATE TABLE IF NOT EXISTS alerts (
          id SERIAL PRIMARY KEY,
          level VARCHAR(20) NOT NULL,
          title VARCHAR(255) NOT NULL,
          message TEXT NOT NULL,
          context JSONB,
          channels TEXT[],
          timestamp TIMESTAMPTZ NOT NULL,
          resolved BOOLEAN DEFAULT FALSE,
          resolved_at TIMESTAMPTZ,
          notifications_sent TEXT[],
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
    } catch (error: any) {
      logError('Failed to create alerts table', { error: error.message });
    }
  }

  private levelToSeverity(level: AlertLevel): ErrorSeverity {
    switch (level) {
      case AlertLevel.CRITICAL:
        return ErrorSeverity.CRITICAL;
      case AlertLevel.ERROR:
        return ErrorSeverity.HIGH;
      case AlertLevel.WARNING:
        return ErrorSeverity.MEDIUM;
      default:
        return ErrorSeverity.LOW;
    }
  }

  async manualTrigger(ruleId: string): Promise<boolean> {
    const rule = this.rules.get(ruleId);
    if (!rule) {
      return false;
    }

    await this.triggerAlert(rule);
    return true;
  }

  getActiveAlerts(): Alert[] {
    return Array.from(this.activeAlerts.values()).filter(a => !a.resolved);
  }

  getRules(): AlertRule[] {
    return Array.from(this.rules.values());
  }

  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }
}

export const alertManager = AlertManager.getInstance();

process.on('SIGTERM', () => {
  alertManager.stop();
});

process.on('SIGINT', () => {
  alertManager.stop();
});