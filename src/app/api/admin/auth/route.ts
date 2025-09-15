import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { password } = await req.json();

    // Check if password matches admin secret
    if (!password || !process.env.ADMIN_SECRET) {
      return NextResponse.json({
        ok: false,
        error: 'Invalid credentials'
      }, { status: 401 });
    }

    if (password !== process.env.ADMIN_SECRET) {
      return NextResponse.json({
        ok: false,
        error: 'Invalid password'
      }, { status: 401 });
    }

    // Create response with auth cookie
    const response = NextResponse.json({
      ok: true,
      message: 'Authentication successful'
    });

    // Set secure httpOnly cookie (expires in 24 hours)
    response.cookies.set('admin-auth', process.env.ADMIN_SECRET, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24, // 24 hours
      path: '/'
    });

    return response;
  } catch (error: any) {
    return NextResponse.json({
      ok: false,
      error: 'Authentication failed'
    }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  // Logout endpoint
  const response = NextResponse.json({
    ok: true,
    message: 'Logged out successfully'
  });

  response.cookies.delete('admin-auth');

  return response;
}