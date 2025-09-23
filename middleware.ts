import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const url = new URL(req.url);
  const range = req.headers.get("range");
  const isMedia = url.pathname.startsWith("/test-audio/") || url.pathname.endsWith(".mp3");

  // Strip malformed Range headers to prevent 416 errors
  if (range && !/^bytes=\d*-\d*$/.test(range)) {
    const headers = new Headers(req.headers);
    headers.delete("range");
    return NextResponse.next({
      request: { headers }
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/:path*"]
};