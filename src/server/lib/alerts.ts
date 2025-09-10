import { db } from '../db';

interface SlackMessage {
  text: string;
  blocks?: any[];
  channel?: string;
  username?: string;
  icon_emoji?: string;
}

interface SlackResponse {
  ok: boolean;
  error?: string;
  ts?: string;
  channel?: string;
}

// Circuit breaker state
let circuitBreakerOpen = false;
let circuitBreakerOpenUntil = 0;
let consecutiveFailures = 0;
const CIRCUIT_BREAKER_THRESHOLD = 3;
const CIRCUIT_BREAKER_DURATION = 60000; // 60 seconds

/**
 * Post message to Slack with timeout, retry, and circuit breaker
 */
export async function postSlack(
  message: string | SlackMessage,
  blocks?: any[]
): Promise<{ ok: boolean; error?: string }> {
  // Check circuit breaker
  if (circuitBreakerOpen) {
    if (Date.now() < circuitBreakerOpenUntil) {
      console.warn('[Slack] Circuit breaker open, skipping request');
      return { ok: false, error: 'circuit_breaker_open' };
    } else {
      // Reset circuit breaker
      circuitBreakerOpen = false;
      consecutiveFailures = 0;
      console.log('[Slack] Circuit breaker reset');
    }
  }

  // Get Slack webhook URL from environment or database
  const webhookUrl = process.env.SLACK_ALERT_WEBHOOK || await getSlackWebhookUrl();
  
  if (!webhookUrl) {
    console.warn('[Slack] No webhook URL configured');
    return { ok: false, error: 'no_webhook_url' };
  }

  // Normalize message
  const payload: SlackMessage = typeof message === 'string' 
    ? { text: message, blocks } 
    : message;

  // Add blocks if provided separately
  if (blocks && !payload.blocks) {
    payload.blocks = blocks;
  }

  // Attempt with retry
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000); // 2s timeout

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (response.ok) {
        // Reset consecutive failures on success
        consecutiveFailures = 0;
        
        // Log success
        await logSlackAlert('success', payload);
        
        return { ok: true };
      }

      // Non-2xx response
      const errorText = await response.text();
      console.error(`[Slack] HTTP ${response.status}: ${errorText}`);
      
      if (attempt === 2) {
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error: any) {
      console.error(`[Slack] Attempt ${attempt} failed:`, error.message);
      
      if (attempt === 2) {
        // Final attempt failed
        consecutiveFailures++;
        
        // Open circuit breaker if threshold reached
        if (consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
          circuitBreakerOpen = true;
          circuitBreakerOpenUntil = Date.now() + CIRCUIT_BREAKER_DURATION;
          console.warn('[Slack] Circuit breaker opened due to consecutive failures');
        }
        
        // Log failure
        await logSlackAlert('failed', payload, error.message);
        
        return { ok: false, error: error.message };
      }
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  return { ok: false, error: 'max_retries_exceeded' };
}

/**
 * Get Slack webhook URL from agency settings
 */
async function getSlackWebhookUrl(): Promise<string | null> {
  try {
    const settings = await db.oneOrNone(`
      SELECT slack_webhook_url 
      FROM agency_settings 
      WHERE alerts_enabled = true
      LIMIT 1
    `);
    
    return settings?.slack_webhook_url || null;
  } catch (error) {
    console.error('[Slack] Error fetching webhook URL:', error);
    return null;
  }
}

/**
 * Log Slack alert attempt
 */
async function logSlackAlert(
  status: 'success' | 'failed',
  payload: SlackMessage,
  error?: string
): Promise<void> {
  try {
    await db.none(`
      INSERT INTO alert_logs (type, status, payload, error)
      VALUES ('slack', $1, $2, $3)
    `, [status, payload, error || null]);
  } catch (err) {
    console.error('[Slack] Error logging alert:', err);
  }
}

/**
 * Send high-risk call alert to Slack
 */
export async function sendHighRiskCallAlert(
  callId: string,
  reason: string,
  details: {
    qaScore?: number;
    reasonPrimary?: string;
    duration?: number;
    customerPhone?: string;
    agentName?: string;
  }
): Promise<void> {
  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '⚠️ High-Risk Call Detected',
        emoji: true
      }
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Call ID:*\n${callId}`
        },
        {
          type: 'mrkdwn',
          text: `*Risk Reason:*\n${reason}`
        }
      ]
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*QA Score:*\n${details.qaScore ?? 'N/A'}`
        },
        {
          type: 'mrkdwn',
          text: `*Duration:*\n${details.duration ? `${Math.floor(details.duration / 60)}m ${details.duration % 60}s` : 'N/A'}`
        }
      ]
    }
  ];

  if (details.reasonPrimary) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Primary Reason:* ${details.reasonPrimary}`
      }
    });
  }

  if (details.customerPhone || details.agentName) {
    blocks.push({
      type: 'context',
      elements: [
        ...(details.customerPhone ? [{
          type: 'mrkdwn',
          text: `Customer: ${details.customerPhone}`
        }] : []),
        ...(details.agentName ? [{
          type: 'mrkdwn',
          text: `Agent: ${details.agentName}`
        }] : [])
      ]
    });
  }

  // Add action button to view call
  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: 'View Call Details',
          emoji: true
        },
        url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/calls/${callId}`,
        style: 'primary'
      }
    ]
  });

  await postSlack({
    text: `High-risk call detected: ${callId} - ${reason}`,
    blocks
  });
}

/**
 * Test Slack connection
 */
export async function testSlackConnection(): Promise<{ ok: boolean; error?: string }> {
  return postSlack({
    text: 'Test message from SyncedUp Call AI',
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '✅ Slack integration is working!'
        }
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Tested at: ${new Date().toISOString()}`
          }
        ]
      }
    ]
  });
}

/**
 * Legacy alert function for backwards compatibility
 */
export async function alert(eventName: string, payload: any) {
  const webhookUrl = process.env.SLACK_ALERT_WEBHOOK;
  
  if (!webhookUrl) {
    console.warn(`[ALERT] Slack webhook not configured - skipping alert: ${eventName}`, payload);
    return;
  }

  try {
    let message = '';
    
    if (eventName === 'same_day_cancel') {
      const { agent, phone, duration_sec, premium } = payload;
      message = `:rotating_light: SAME-DAY CANCEL | Agent: ${agent || 'Unknown'} | Phone: ${phone || 'N/A'} | Dur: ${duration_sec}s | Policy: $${premium || 0}/mo`;
    } else if (eventName === 'high_value_risk') {
      const { reason, agent, phone, premium } = payload;
      message = `:warning: HIGH-VALUE AT RISK | Reason: ${reason} | Agent: ${agent || 'Unknown'} | Phone: ${phone || 'N/A'} | Premium: $${premium}/mo`;
    } else {
      message = `:information_source: ${eventName} | ${JSON.stringify(payload)}`;
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: message })
    });

    if (!response.ok) {
      console.error(`[ALERT] Slack webhook failed: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.error('[ALERT] Failed to send Slack alert:', error);
  }
}