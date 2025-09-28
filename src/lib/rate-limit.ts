import { NextRequest, NextResponse } from 'next/server';

const rateLimit = new Map<string, { count: number; resetTime: number }>();

export function withRateLimit(
  handler: (req: NextRequest) => Promise<NextResponse>,
  options = { maxRequests: 100, windowMs: 60000 }
) {
  return async function rateLimitedHandler(req: NextRequest) {
    const clientId = req.headers.get('x-forwarded-for') ||
                     req.headers.get('x-real-ip') ||
                     'unknown';

    const now = Date.now();
    const clientData = rateLimit.get(clientId);

    if (!clientData || clientData.resetTime < now) {
      rateLimit.set(clientId, { count: 1, resetTime: now + options.windowMs });
    } else {
      clientData.count++;

      if (clientData.count > options.maxRequests) {
        return NextResponse.json(
          { error: 'Too many requests' },
          { status: 429 }
        );
      }
    }

    return handler(req);
  };
}