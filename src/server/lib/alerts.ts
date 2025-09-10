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