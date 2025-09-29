import { NextRequest, NextResponse } from 'next/server';

// This is a pass-through wrapper since rate limiting is now handled in middleware
// We keep this to avoid breaking existing code that imports it
export function withRateLimit(
  handler: (req: NextRequest) => Promise<NextResponse>,
  options?: { endpoint?: string }
) {
  // Rate limiting is handled by middleware.ts
  // This function now just passes through to the handler
  return handler;
}