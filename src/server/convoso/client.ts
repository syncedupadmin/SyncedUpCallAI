import { ConvosoCall, ConvosoCallPage, ConvosoAPIResponse } from './types';

// Circuit breaker for Convoso API (extend existing pattern)
type CircuitState = 'closed' | 'open' | 'halfOpen';

interface ConvosoCircuitBreaker {
  state: CircuitState;
  failures: number;
  lastFailureTime: number;
  successCount: number;
  lastAttemptTime: number;
}

const CIRCUIT_CONFIG = {
  failureThreshold: 5,
  failureWindow: 5 * 60 * 1000, // 5 minutes
  cooldownPeriod: 60 * 1000,    // 60 seconds
  halfOpenTestLimit: 1,
};

const breaker: ConvosoCircuitBreaker = {
  state: 'closed',
  failures: 0,
  lastFailureTime: 0,
  successCount: 0,
  lastAttemptTime: 0,
};

function canAttempt(): boolean {
  const now = Date.now();

  switch (breaker.state) {
    case 'closed':
      return true;

    case 'open':
      if (now - breaker.lastFailureTime >= CIRCUIT_CONFIG.cooldownPeriod) {
        console.log('[Convoso Circuit] Transitioning to half-open');
        breaker.state = 'halfOpen';
        breaker.successCount = 0;
        return true;
      }
      return false;

    case 'halfOpen':
      return breaker.successCount < CIRCUIT_CONFIG.halfOpenTestLimit;

    default:
      return false;
  }
}

function recordSuccess(): void {
  if (breaker.state === 'halfOpen') {
    breaker.successCount++;
    if (breaker.successCount >= CIRCUIT_CONFIG.halfOpenTestLimit) {
      console.log('[Convoso Circuit] Closing circuit after successful test');
      breaker.state = 'closed';
      breaker.failures = 0;
    }
  } else if (breaker.state === 'closed') {
    breaker.failures = 0;
  }
  breaker.lastAttemptTime = Date.now();
}

function recordFailure(error: Error): void {
  const now = Date.now();

  // Check if this is a retriable error
  const isCircuitError =
    error.message.includes('429') ||
    error.message.includes('500') ||
    error.message.includes('502') ||
    error.message.includes('503') ||
    error.message.includes('504') ||
    error.message.includes('timeout');

  if (!isCircuitError) {
    return; // Don't count client errors
  }

  if (now - breaker.lastFailureTime > CIRCUIT_CONFIG.failureWindow) {
    breaker.failures = 0;
  }

  breaker.failures++;
  breaker.lastFailureTime = now;
  breaker.lastAttemptTime = now;

  if (breaker.failures >= CIRCUIT_CONFIG.failureThreshold) {
    console.log(`[Convoso Circuit] Opening circuit after ${breaker.failures} failures`);
    breaker.state = 'open';
  }

  if (breaker.state === 'halfOpen') {
    console.log('[Convoso Circuit] Re-opening circuit after half-open test failure');
    breaker.state = 'open';
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch calls from Convoso API with auth token and retry logic
 */
export async function fetchCalls(opts: {
  from?: string;
  to?: string;
  page?: number;
  perPage?: number;
}): Promise<ConvosoCallPage> {
  const {
    from,
    to,
    page = 1,
    perPage = 100
  } = opts;

  const baseUrl = process.env.CONVOSO_BASE_URL || 'https://api.convoso.com/v1';
  const authToken = process.env.CONVOSO_AUTH_TOKEN;

  if (!authToken) {
    throw new Error('CONVOSO_AUTH_TOKEN not configured');
  }

  // Build query parameters
  const params = new URLSearchParams({
    auth_token: authToken,
    offset: ((page - 1) * perPage).toString(),
    limit: perPage.toString(),
  });

  if (from) {
    params.append('start_date', from.split('T')[0]); // Extract date part
  }
  if (to) {
    params.append('end_date', to.split('T')[0]); // Extract date part
  }

  const url = `${baseUrl}/lead/get-recordings?${params}`;

  // Retry logic with circuit breaker
  const maxAttempts = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (!canAttempt()) {
      const timeUntilRetry = Math.max(0,
        CIRCUIT_CONFIG.cooldownPeriod - (Date.now() - breaker.lastFailureTime)
      );
      throw new Error(
        `Convoso API circuit breaker open. Retry in ${Math.ceil(timeUntilRetry / 1000)}s`
      );
    }

    try {
      console.log(`[Convoso] Fetching page ${page} (attempt ${attempt}/${maxAttempts})`);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Convoso API error: ${response.status} ${response.statusText}`);
      }

      const data: ConvosoAPIResponse = await response.json();

      if (!data.success) {
        throw new Error(`Convoso API failure: ${data.error || 'Unknown error'}`);
      }

      recordSuccess();

      // Transform API response to our format
      const calls: ConvosoCall[] = (data.data || []).map(item => ({
        id: item.call_id,
        started_at: item.start_time || new Date().toISOString(),
        ended_at: item.end_time,
        agent: item.agent_name,
        agent_id: item.agent_id,
        disposition: item.disposition,
        duration_sec: item.duration,
        talk_time_sec: item.talk_time,
        wrap_time_sec: item.wrap_time,
        recording_url: item.recording_url,
        lead_phone: item.phone_number,
        lead_id: item.lead_id,
        campaign: item.campaign_name || item.campaign_id,
        direction: item.direction || 'outbound',
        queue: item.queue,
        language: item.language,
        tags: item.tags,
        raw: item, // Store full payload
      }));

      const total = data.total || 0;
      const totalPages = Math.ceil(total / perPage);

      return {
        data: calls,
        page,
        total_pages: totalPages,
        total,
      };

    } catch (error: any) {
      lastError = error;
      recordFailure(error);

      console.error(`[Convoso] Attempt ${attempt} failed:`, error.message);

      if (attempt < maxAttempts) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
        console.log(`[Convoso] Retrying in ${delay}ms...`);
        await sleep(delay);
      }
    }
  }

  throw lastError || new Error('Failed to fetch Convoso calls');
}

/**
 * Get circuit breaker status for monitoring
 */
export function getCircuitStatus(): Record<string, any> {
  return {
    state: breaker.state,
    failures: breaker.failures,
    lastFailure: breaker.lastFailureTime ? new Date(breaker.lastFailureTime).toISOString() : null,
    successCount: breaker.successCount,
    lastAttempt: breaker.lastAttemptTime ? new Date(breaker.lastAttemptTime).toISOString() : null,
  };
}