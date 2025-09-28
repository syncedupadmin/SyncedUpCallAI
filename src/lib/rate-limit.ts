import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@vercel/firewall';

export function withRateLimit(
  handler: (req: NextRequest) => Promise<NextResponse>,
  options?: { endpoint?: string }
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    // Use the endpoint name or default to 'api-request'
    const ruleName = options?.endpoint || 'api-request';

    const { rateLimited } = await checkRateLimit(ruleName, { request: req });

    if (rateLimited) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429 }
      );
    }

    return handler(req);
  };
}