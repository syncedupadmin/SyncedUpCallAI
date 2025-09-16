import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/src/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({
        ok: false,
        error: 'Not authenticated',
        user: null,
        level: null
      });
    }

    // Get user's level
    const { data: userLevel, error: levelError } = await supabase.rpc('get_user_level');

    // Check admin status
    const { data: isAdmin, error: adminError } = await supabase.rpc('is_admin');

    // Check super admin status
    const { data: isSuperAdmin, error: superError } = await supabase.rpc('is_super_admin');

    return NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email
      },
      level: userLevel,
      isAdmin,
      isSuperAdmin,
      expectedPortal: userLevel === 'super_admin' ? '/admin/super' :
                     userLevel === 'admin' ? '/admin' :
                     '/dashboard',
      errors: {
        levelError: levelError?.message,
        adminError: adminError?.message,
        superError: superError?.message
      }
    });

  } catch (error: any) {
    console.error('Error checking user level:', error);
    return NextResponse.json({
      ok: false,
      error: error.message
    }, { status: 500 });
  }
}