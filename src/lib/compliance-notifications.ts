/**
 * Compliance Email Notification Service
 * Sends alerts for compliance failures and flagged reviews
 */

import { db } from '@/server/db';
import { logInfo, logError } from '@/lib/log';

interface ComplianceAlert {
  type: 'failure' | 'flagged' | 'low_score' | 'missing_phrases';
  severity: 'high' | 'medium' | 'low';
  agent_name: string;
  agency_id: string;
  call_id: string;
  score: number;
  issues: string[];
  script_name: string;
  timestamp: Date;
}

interface NotificationRecipient {
  email: string;
  name: string;
  role: 'admin' | 'supervisor' | 'compliance_officer';
  agency_id: string;
  notification_preferences: {
    compliance_failures: boolean;
    daily_digest: boolean;
    immediate_alerts: boolean;
  };
}

/**
 * Send compliance failure alert
 */
export async function sendComplianceAlert(alert: ComplianceAlert): Promise<void> {
  try {
    // Get recipients for this agency
    const recipients = await getComplianceRecipients(alert.agency_id, alert.severity);

    if (recipients.length === 0) {
      logInfo({
        event_type: 'no_compliance_recipients',
        agency_id: alert.agency_id,
        alert_type: alert.type
      });
      return;
    }

    // Store notification in database
    await db.none(`
      INSERT INTO compliance_notifications (
        agency_id,
        alert_type,
        severity,
        agent_name,
        call_id,
        score,
        issues,
        script_name,
        recipients,
        sent_at,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), 'pending')
    `, [
      alert.agency_id,
      alert.type,
      alert.severity,
      alert.agent_name,
      alert.call_id,
      alert.score,
      alert.issues,
      alert.script_name,
      recipients.map(r => r.email)
    ]);

    // Format email content
    const emailContent = formatComplianceEmail(alert);

    // Send email to each recipient
    for (const recipient of recipients) {
      try {
        await sendEmail({
          to: recipient.email,
          subject: getEmailSubject(alert),
          html: emailContent.html,
          text: emailContent.text
        });

        logInfo({
          event_type: 'compliance_alert_sent',
          recipient: recipient.email,
          alert_type: alert.type,
          agency_id: alert.agency_id
        });
      } catch (error) {
        logError('Failed to send compliance email', error, {
          recipient: recipient.email,
          alert_type: alert.type
        });
      }
    }

    // Update notification status
    await db.none(`
      UPDATE compliance_notifications
      SET status = 'sent', sent_at = NOW()
      WHERE agency_id = $1 AND call_id = $2 AND alert_type = $3
    `, [alert.agency_id, alert.call_id, alert.type]);

  } catch (error: any) {
    logError('Failed to send compliance alert', error, { alert });
    throw error;
  }
}

/**
 * Get compliance notification recipients
 */
async function getComplianceRecipients(
  agencyId: string,
  severity: 'high' | 'medium' | 'low'
): Promise<NotificationRecipient[]> {
  try {
    // Get agency admins and compliance officers
    const recipients = await db.manyOrNone(`
      SELECT
        u.email,
        u.raw_user_meta_data->>'full_name' as name,
        am.role,
        am.agency_id,
        COALESCE(
          u.raw_user_meta_data->'notification_preferences',
          '{"compliance_failures": true, "daily_digest": false, "immediate_alerts": true}'::jsonb
        ) as notification_preferences
      FROM user_agencies am
      INNER JOIN auth.users u ON u.id = am.user_id
      WHERE am.agency_id = $1
      AND am.role IN ('admin', 'owner', 'compliance_officer')
    `, [agencyId]);

    // Filter based on severity and preferences
    return recipients.filter(r => {
      const prefs = r.notification_preferences;

      // High severity always sends
      if (severity === 'high') return true;

      // Check preferences for medium/low
      if (severity === 'medium' && prefs.compliance_failures) return true;
      if (severity === 'low' && prefs.daily_digest) return false; // Save for digest

      return prefs.immediate_alerts;
    });

  } catch (error: any) {
    logError('Failed to get compliance recipients', error, { agency_id: agencyId });
    return [];
  }
}

/**
 * Format compliance email content
 */
function formatComplianceEmail(alert: ComplianceAlert): { html: string; text: string } {
  const severityColor = {
    high: '#ef4444',
    medium: '#f59e0b',
    low: '#3b82f6'
  }[alert.severity];

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; background: #f3f4f6; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; }
        .header { background: ${severityColor}; color: white; padding: 20px; }
        .content { padding: 30px; }
        .metric { display: inline-block; margin: 10px 20px 10px 0; }
        .metric-label { color: #6b7280; font-size: 12px; text-transform: uppercase; }
        .metric-value { font-size: 24px; font-weight: bold; color: #111827; }
        .issues { background: #fef2f2; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0; }
        .issues-title { color: #991b1b; font-weight: bold; margin-bottom: 10px; }
        .issues-list { list-style: none; padding: 0; }
        .issues-list li { padding: 5px 0; color: #7f1d1d; }
        .action-button { display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px; }
        .footer { background: #f9fafb; padding: 20px; text-align: center; color: #6b7280; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2 style="margin: 0;">⚠️ Compliance Alert</h2>
          <p style="margin: 10px 0 0; opacity: 0.9;">Post-Close Script Compliance Issue Detected</p>
        </div>

        <div class="content">
          <div class="metrics">
            <div class="metric">
              <div class="metric-label">Agent</div>
              <div class="metric-value">${alert.agent_name}</div>
            </div>
            <div class="metric">
              <div class="metric-label">Compliance Score</div>
              <div class="metric-value" style="color: ${alert.score < 80 ? '#ef4444' : '#10b981'};">
                ${alert.score.toFixed(1)}%
              </div>
            </div>
            <div class="metric">
              <div class="metric-label">Script</div>
              <div class="metric-value" style="font-size: 16px;">${alert.script_name}</div>
            </div>
          </div>

          ${alert.issues.length > 0 ? `
            <div class="issues">
              <div class="issues-title">Compliance Issues Detected:</div>
              <ul class="issues-list">
                ${alert.issues.map(issue => `<li>• ${issue}</li>`).join('')}
              </ul>
            </div>
          ` : ''}

          <p style="color: #374151; line-height: 1.6; margin-top: 20px;">
            This call has been flagged for immediate review. The agent failed to properly read the required
            post-close compliance script, which could result in regulatory violations.
          </p>

          <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://syncedupcallai.vercel.app'}/compliance/results?call_id=${alert.call_id}"
             class="action-button">
            Review Call Details →
          </a>
        </div>

        <div class="footer">
          <p>Call ID: ${alert.call_id}</p>
          <p>Generated: ${alert.timestamp.toLocaleString()}</p>
          <p style="margin-top: 15px;">
            This is an automated compliance alert. Please review immediately to ensure regulatory compliance.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `
COMPLIANCE ALERT - ${alert.severity.toUpperCase()} SEVERITY

Agent: ${alert.agent_name}
Compliance Score: ${alert.score.toFixed(1)}%
Script: ${alert.script_name}
Call ID: ${alert.call_id}

Issues Detected:
${alert.issues.map(issue => `• ${issue}`).join('\n')}

This call requires immediate review. The agent failed to properly read the required post-close compliance script.

Review at: ${process.env.NEXT_PUBLIC_APP_URL || 'https://syncedupcallai.vercel.app'}/compliance/results?call_id=${alert.call_id}

Generated: ${alert.timestamp.toLocaleString()}
  `.trim();

  return { html, text };
}

/**
 * Get email subject based on alert
 */
function getEmailSubject(alert: ComplianceAlert): string {
  const prefix = {
    high: '🚨 URGENT',
    medium: '⚠️ Important',
    low: '📋 Notice'
  }[alert.severity];

  return `${prefix}: Compliance Failure - ${alert.agent_name} (${alert.score.toFixed(0)}% Score)`;
}

/**
 * Send email (placeholder - integrate with your email service)
 */
async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  // TODO: Integrate with your email service (SendGrid, AWS SES, etc.)
  // For now, just log the email
  logInfo({
    event_type: 'email_would_be_sent',
    to: params.to,
    subject: params.subject
  });

  // Example SendGrid integration:
  /*
  const sgMail = require('@sendgrid/mail');
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);

  const msg = {
    to: params.to,
    from: 'compliance@syncedupcallai.com',
    subject: params.subject,
    text: params.text,
    html: params.html,
  };

  await sgMail.send(msg);
  */
}

/**
 * Send daily compliance digest
 */
export async function sendDailyComplianceDigest(agencyId: string): Promise<void> {
  try {
    // Get yesterday's compliance results
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const stats = await db.one(`
      SELECT
        COUNT(*) as total_calls,
        SUM(CASE WHEN compliance_passed THEN 1 ELSE 0 END) as passed,
        SUM(CASE WHEN NOT compliance_passed THEN 1 ELSE 0 END) as failed,
        AVG(overall_score) as avg_score,
        array_agg(DISTINCT agent_name) FILTER (WHERE NOT compliance_passed) as failed_agents
      FROM post_close_compliance
      WHERE agency_id = $1
      AND analyzed_at >= $2
      AND analyzed_at < $3
    `, [agencyId, yesterday, today]);

    if (stats.total_calls === 0) {
      return; // No calls to report
    }

    // Get recipients who want daily digests
    const recipients = await db.manyOrNone(`
      SELECT
        u.email,
        u.raw_user_meta_data->>'full_name' as name
      FROM user_agencies am
      INNER JOIN auth.users u ON u.id = am.user_id
      WHERE am.agency_id = $1
      AND am.role IN ('admin', 'owner', 'compliance_officer')
      AND (u.raw_user_meta_data->'notification_preferences'->>'daily_digest')::boolean = true
    `, [agencyId]);

    if (recipients.length === 0) {
      return;
    }

    // Format and send digest
    const passRate = (stats.passed / stats.total_calls * 100).toFixed(1);
    const subject = `Daily Compliance Report: ${passRate}% Pass Rate (${stats.total_calls} calls)`;

    for (const recipient of recipients) {
      await sendEmail({
        to: recipient.email,
        subject,
        html: formatDigestEmail(stats, yesterday),
        text: formatDigestText(stats, yesterday)
      });
    }

    logInfo({
      event_type: 'daily_digest_sent',
      agency_id: agencyId,
      recipients: recipients.length,
      stats
    });

  } catch (error: any) {
    logError('Failed to send daily compliance digest', error, { agency_id: agencyId });
  }
}

function formatDigestEmail(stats: any, date: Date): string {
  const passRate = (stats.passed / stats.total_calls * 100).toFixed(1);

  return `
    <h2>Daily Compliance Report - ${date.toLocaleDateString()}</h2>
    <p><strong>Total Calls:</strong> ${stats.total_calls}</p>
    <p><strong>Passed:</strong> ${stats.passed} (${passRate}%)</p>
    <p><strong>Failed:</strong> ${stats.failed}</p>
    <p><strong>Average Score:</strong> ${stats.avg_score.toFixed(1)}%</p>
    ${stats.failed_agents?.length > 0 ? `
      <p><strong>Agents with Failures:</strong> ${stats.failed_agents.join(', ')}</p>
    ` : ''}
  `;
}

function formatDigestText(stats: any, date: Date): string {
  const passRate = (stats.passed / stats.total_calls * 100).toFixed(1);

  return `
Daily Compliance Report - ${date.toLocaleDateString()}

Total Calls: ${stats.total_calls}
Passed: ${stats.passed} (${passRate}%)
Failed: ${stats.failed}
Average Score: ${stats.avg_score.toFixed(1)}%
${stats.failed_agents?.length > 0 ? `\nAgents with Failures: ${stats.failed_agents.join(', ')}` : ''}
  `.trim();
}