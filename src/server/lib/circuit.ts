/**
 * Simple in-memory circuit breaker for ASR providers
 */

type CircuitState = 'closed' | 'open' | 'halfOpen';
type Provider = 'deepgram';

interface CircuitBreaker {
  state: CircuitState;
  failures: number;
  lastFailureTime: number;
  successCount: number;
  lastAttemptTime: number;
}

// Circuit breaker configuration
const CONFIG = {
  failureThreshold: 3,        // Trip after 3 consecutive failures
  failureWindow: 2 * 60 * 1000, // Within 2 minutes
  cooldownPeriod: 60 * 1000,    // 60 seconds cooldown
  halfOpenTestLimit: 1,         // Allow 1 test call in half-open state
};

// In-memory state for each provider
const breakers: Record<Provider, CircuitBreaker> = {
  deepgram: {
    state: 'closed',
    failures: 0,
    lastFailureTime: 0,
    successCount: 0,
    lastAttemptTime: 0,
  },
};

/**
 * Check if circuit breaker allows the request
 */
function canAttempt(provider: Provider): boolean {
  const breaker = breakers[provider];
  const now = Date.now();

  switch (breaker.state) {
    case 'closed':
      return true;

    case 'open':
      // Check if cooldown period has passed
      if (now - breaker.lastFailureTime >= CONFIG.cooldownPeriod) {
        console.log(`[Circuit] ${provider}: Transitioning to half-open after cooldown`);
        breaker.state = 'halfOpen';
        breaker.successCount = 0;
        return true;
      }
      return false;

    case 'halfOpen':
      // Allow one test request
      return breaker.successCount < CONFIG.halfOpenTestLimit;

    default:
      return false;
  }
}

/**
 * Record a successful call
 */
function recordSuccess(provider: Provider): void {
  const breaker = breakers[provider];
  
  if (breaker.state === 'halfOpen') {
    breaker.successCount++;
    if (breaker.successCount >= CONFIG.halfOpenTestLimit) {
      console.log(`[Circuit] ${provider}: Closing circuit after successful test`);
      breaker.state = 'closed';
      breaker.failures = 0;
    }
  } else if (breaker.state === 'closed') {
    // Reset failure count on success
    breaker.failures = 0;
  }
  
  breaker.lastAttemptTime = Date.now();
}

/**
 * Record a failed call
 */
function recordFailure(provider: Provider, error: Error): void {
  const breaker = breakers[provider];
  const now = Date.now();

  // Check if this is a timeout or 5xx error
  const isCircuitError = 
    error.message.includes('timeout') ||
    error.message.includes('ETIMEDOUT') ||
    error.message.includes('500') ||
    error.message.includes('502') ||
    error.message.includes('503') ||
    error.message.includes('504');

  if (!isCircuitError) {
    // Don't count client errors toward circuit breaking
    return;
  }

  // Reset failure count if outside failure window
  if (now - breaker.lastFailureTime > CONFIG.failureWindow) {
    breaker.failures = 0;
  }

  breaker.failures++;
  breaker.lastFailureTime = now;
  breaker.lastAttemptTime = now;

  // Trip the circuit if threshold reached
  if (breaker.failures >= CONFIG.failureThreshold) {
    console.log(`[Circuit] ${provider}: Opening circuit after ${breaker.failures} failures`);
    breaker.state = 'open';
  }

  // If in half-open state, immediately open on failure
  if (breaker.state === 'halfOpen') {
    console.log(`[Circuit] ${provider}: Re-opening circuit after half-open test failure`);
    breaker.state = 'open';
  }
}

/**
 * Sleep with jitter for backoff
 */
async function sleep(ms: number, jitter = 300): Promise<void> {
  const delay = ms + Math.random() * jitter * 2 - jitter;
  return new Promise(resolve => setTimeout(resolve, Math.max(0, delay)));
}

/**
 * Wrap a function with circuit breaker and retry logic
 */
export async function withBreaker<T>(
  provider: Provider,
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    baseDelay?: number;
    maxDelay?: number;
    timeout?: number;
  } = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelay = 1000,
    maxDelay = 4000,
    timeout = 60000,
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Check circuit breaker
    if (!canAttempt(provider)) {
      const breaker = breakers[provider];
      const timeUntilRetry = Math.max(0, 
        CONFIG.cooldownPeriod - (Date.now() - breaker.lastFailureTime)
      );
      
      throw new Error(
        `Circuit breaker open for ${provider}. Retry in ${Math.ceil(timeUntilRetry / 1000)}s`
      );
    }

    try {
      // Create timeout wrapper
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Timeout after ${timeout}ms`)), timeout);
      });

      // Race between function and timeout
      const result = await Promise.race([fn(), timeoutPromise]);
      
      // Record success
      recordSuccess(provider);
      
      return result as T;
    } catch (error: any) {
      lastError = error;
      
      // Record failure
      recordFailure(provider, error);
      
      console.error(`[Circuit] ${provider} attempt ${attempt}/${maxAttempts} failed:`, error.message);

      // Don't retry if circuit is now open
      if (!canAttempt(provider)) {
        break;
      }

      // Don't retry on last attempt
      if (attempt < maxAttempts) {
        // Exponential backoff with jitter
        const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
        console.log(`[Circuit] ${provider}: Retrying in ${delay}ms...`);
        await sleep(delay);
      }
    }
  }

  throw lastError || new Error(`Failed after ${maxAttempts} attempts`);
}

/**
 * Get circuit breaker status (for monitoring)
 */
export function getCircuitStatus(provider?: Provider): Record<string, any> {
  if (provider) {
    const breaker = breakers[provider];
    return {
      [provider]: {
        state: breaker.state,
        failures: breaker.failures,
        lastFailure: breaker.lastFailureTime ? new Date(breaker.lastFailureTime).toISOString() : null,
        successCount: breaker.successCount,
      }
    };
  }

  // Return all breakers status
  return Object.entries(breakers).reduce((acc, [key, breaker]) => {
    acc[key] = {
      state: breaker.state,
      failures: breaker.failures,
      lastFailure: breaker.lastFailureTime ? new Date(breaker.lastFailureTime).toISOString() : null,
      successCount: breaker.successCount,
    };
    return acc;
  }, {} as Record<string, any>);
}

/**
 * Reset circuit breaker (for testing)
 */
export function resetCircuit(provider: Provider): void {
  breakers[provider] = {
    state: 'closed',
    failures: 0,
    lastFailureTime: 0,
    successCount: 0,
    lastAttemptTime: 0,
  };
}