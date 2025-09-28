import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const COOKIE_NAME = 'password_reset_session';
const MAX_AGE = 900; // 15 minutes in seconds

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, createdAt } = body;

    const cookieStore = cookies();
    const isProduction = process.env.NODE_ENV === 'production';
    const host = request.headers.get('host') || '';
    const isLocalhost = host.startsWith('localhost');

    if (action === 'set') {
      // Set the recovery session cookie
      const sessionData = {
        createdAt: createdAt || Date.now()
      };

      cookieStore.set({
        name: COOKIE_NAME,
        value: JSON.stringify(sessionData),
        httpOnly: true,
        secure: isProduction && !isLocalhost,
        sameSite: 'strict',
        path: '/',
        maxAge: MAX_AGE
      });

      return NextResponse.json({
        ok: true,
        message: 'Recovery session cookie set'
      });
    }

    if (action === 'clear') {
      // Clear the recovery session cookie
      cookieStore.set({
        name: COOKIE_NAME,
        value: '',
        httpOnly: true,
        secure: isProduction && !isLocalhost,
        sameSite: 'strict',
        path: '/',
        maxAge: 0
      });

      return NextResponse.json({
        ok: true,
        message: 'Recovery session cookie cleared'
      });
    }

    if (action === 'check') {
      // Check if recovery session exists and is valid
      const cookie = cookieStore.get(COOKIE_NAME);

      if (!cookie?.value) {
        return NextResponse.json({
          ok: false,
          exists: false,
          message: 'No recovery session'
        });
      }

      try {
        const sessionData = JSON.parse(cookie.value);
        const createdAt = sessionData.createdAt;
        const elapsed = Date.now() - createdAt;
        const isExpired = elapsed > (MAX_AGE * 1000);

        return NextResponse.json({
          ok: true,
          exists: true,
          isExpired,
          createdAt,
          elapsed: Math.floor(elapsed / 1000),
          remainingSeconds: isExpired ? 0 : MAX_AGE - Math.floor(elapsed / 1000)
        });
      } catch (parseError) {
        // Invalid cookie data
        return NextResponse.json({
          ok: false,
          exists: false,
          message: 'Invalid recovery session data'
        });
      }
    }

    return NextResponse.json({
      ok: false,
      error: 'Invalid action. Use "set", "clear", or "check"'
    }, { status: 400 });

  } catch (error: any) {
    console.error('Recovery session API error:', error);
    return NextResponse.json({
      ok: false,
      error: error?.message || 'Internal server error'
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  // GET method to check session status without body
  const cookieStore = cookies();
  const cookie = cookieStore.get(COOKIE_NAME);

  if (!cookie?.value) {
    return NextResponse.json({
      ok: true,
      exists: false,
      message: 'No recovery session'
    });
  }

  try {
    const sessionData = JSON.parse(cookie.value);
    const createdAt = sessionData.createdAt;
    const elapsed = Date.now() - createdAt;
    const isExpired = elapsed > (MAX_AGE * 1000);

    return NextResponse.json({
      ok: true,
      exists: true,
      isExpired,
      createdAt,
      elapsed: Math.floor(elapsed / 1000),
      remainingSeconds: isExpired ? 0 : MAX_AGE - Math.floor(elapsed / 1000)
    });
  } catch (parseError) {
    return NextResponse.json({
      ok: false,
      exists: false,
      message: 'Invalid recovery session data'
    });
  }
}