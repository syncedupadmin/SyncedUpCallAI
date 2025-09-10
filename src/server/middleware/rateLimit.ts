import { NextRequest, NextResponse } from 'next/server';

/**
 * Token bucket rate limiter
 */

interface TokenBucket {
  tokens: number;
  lastRefill: number;
  capacity: number;
  refillRate: number; // tokens per second
}

interface RateLimitConfig {
  capacity: number;      // Max tokens in bucket
  refillRate: number;    // Tokens per second
  windowMs: number;      // Time window in ms
  requestsPerWindow: number; // Max requests per window
}

// Rate limit configurations
const RATE_LIMITS: Record<string, RateLimitConfig> = {
  '/api/jobs': {
    capacity: 30,
    refillRate: 0.1, // 6 tokens per minute
    windowMs: 5 * 60 * 1000, // 5 minutes
    requestsPerWindow: 30,
  },
  '/api/hooks/convoso': {
    capacity: 120,
    refillRate: 2, // 120 tokens per minute
    windowMs: 60 * 1000, // 1 minute
    requestsPerWindow: 120,
  },
  default: {
    capacity: 100,
    refillRate: 1,
    windowMs: 60 * 1000,
    requestsPerWindow: 100,
  },
};

// In-memory storage of token buckets
const buckets = new Map<string, TokenBucket>();

// Cleanup old buckets every 5 minutes
setInterval(() => {
  const now = Date.now();
  const staleTime = 10 * 60 * 1000; // 10 minutes
  
  for (const [key, bucket] of buckets.entries()) {
    if (now - bucket.lastRefill > staleTime) {
      buckets.delete(key);
    }
  }
}, 5 * 60 * 1000);

/**
 * Get client identifier from request
 */
function getClientId(req: NextRequest): string {
  // Try to get IP from various headers
  const forwarded = req.headers.get('x-forwarded-for');
  const realIp = req.headers.get('x-real-ip');
  const ip = forwarded?.split(',')[0] || realIp || 'unknown';
  
  // For job endpoints, also consider the secret
  const secret = req.nextUrl.searchParams.get('secret') || 
                 req.headers.get('authorization')?.replace('Bearer ', '') || 
                 '';
  
  const path = req.nextUrl.pathname;
  
  // Combine IP and secret for job endpoints
  if (path.startsWith('/api/jobs') && secret) {
    return `${ip}:${secret.substring(0, 8)}:${path}`;
  }
  
  return `${ip}:${path}`;
}

/**
 * Get rate limit config for path
 */
function getConfig(path: string): RateLimitConfig {
  // Check for exact match first
  if (RATE_LIMITS[path]) {
    return RATE_LIMITS[path];
  }
  
  // Check for prefix match
  for (const [prefix, config] of Object.entries(RATE_LIMITS)) {
    if (path.startsWith(prefix)) {
      return config;
    }
  }
  
  return RATE_LIMITS.default;
}

/**
 * Refill tokens based on time elapsed
 */
function refillTokens(bucket: TokenBucket, config: RateLimitConfig): void {
  const now = Date.now();
  const timePassed = now - bucket.lastRefill;
  const tokensToAdd = (timePassed / 1000) * config.refillRate;
  
  bucket.tokens = Math.min(config.capacity, bucket.tokens + tokensToAdd);
  bucket.lastRefill = now;
}

/**
 * Check if request should be rate limited
 */
export function isRateLimited(req: NextRequest): {
  limited: boolean;
  retryAfter?: number;
  remaining?: number;
} {
  const clientId = getClientId(req);
  const path = req.nextUrl.pathname;
  const config = getConfig(path);
  
  // Get or create bucket
  let bucket = buckets.get(clientId);
  if (!bucket) {
    bucket = {
      tokens: config.capacity,
      lastRefill: Date.now(),
      capacity: config.capacity,
      refillRate: config.refillRate,
    };
    buckets.set(clientId, bucket);
  }
  
  // Refill tokens
  refillTokens(bucket, config);
  
  // Check if we have tokens
  if (bucket.tokens >= 1) {
    // Consume a token
    bucket.tokens -= 1;
    return {
      limited: false,
      remaining: Math.floor(bucket.tokens),
    };
  }
  
  // Calculate retry after
  const tokensNeeded = 1 - bucket.tokens;
  const secondsToWait = Math.ceil(tokensNeeded / config.refillRate);
  
  return {
    limited: true,
    retryAfter: secondsToWait,
    remaining: 0,
  };
}

/**
 * Rate limit middleware for Next.js API routes
 */
export function withRateLimit(
  handler: (req: NextRequest) => Promise<NextResponse>
): (req: NextRequest) => Promise<NextResponse> {
  return async (req: NextRequest) => {
    const { limited, retryAfter, remaining } = isRateLimited(req);
    
    if (limited) {
      console.log(`[RateLimit] Request blocked: ${getClientId(req)}`);
      
      return NextResponse.json(
        { 
          ok: false, 
          error: 'rate_limited',
          message: `Too many requests. Please retry after ${retryAfter} seconds.`
        },
        { 
          status: 429,
          headers: {
            'Retry-After': String(retryAfter || 60),
            'X-RateLimit-Limit': String(getConfig(req.nextUrl.pathname).capacity),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(Date.now() + (retryAfter || 60) * 1000),
          }
        }
      );
    }
    
    // Add rate limit headers to response
    const response = await handler(req);
    
    if (remaining !== undefined) {
      response.headers.set('X-RateLimit-Limit', String(getConfig(req.nextUrl.pathname).capacity));
      response.headers.set('X-RateLimit-Remaining', String(remaining));
    }
    
    return response;
  };
}

/**
 * Express-style middleware helper for easy integration
 */
export function checkRateLimit(req: NextRequest): NextResponse | null {
  const { limited, retryAfter } = isRateLimited(req);
  
  if (limited) {
    return NextResponse.json(
      { 
        ok: false, 
        error: 'rate_limited',
        message: `Too many requests. Please retry after ${retryAfter} seconds.`
      },
      { 
        status: 429,
        headers: {
          'Retry-After': String(retryAfter || 60),
        }
      }
    );
  }
  
  return null; // Not rate limited
}