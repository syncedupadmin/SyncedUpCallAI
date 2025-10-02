import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: Request) {
  try {
    const { email, name, agencyId, role } = await req.json()

    console.log('[invite-and-add] Request received:', { email, name, agencyId, role })

    // Validate required fields
    if (!email || !agencyId) {
      console.error('[invite-and-add] Missing required fields')
      return NextResponse.json(
        { ok: false, error: 'Email and agency ID are required' },
        { status: 400 }
      )
    }

    // Check if service role key exists
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('[invite-and-add] SUPABASE_SERVICE_ROLE_KEY not configured')
      return NextResponse.json(
        { ok: false, error: 'Server configuration error: Service role key not configured' },
        { status: 500 }
      )
    }

    // Create admin client with service role key
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Determine redirect URL
    const redirectTo = process.env.INVITE_REDIRECT_TO ||
                      `${process.env.NEXT_PUBLIC_SITE_URL || process.env.APP_URL || 'https://synced-up-call-ai.vercel.app'}/auth/callback`

    console.log('[invite-and-add] Using redirectTo:', redirectTo)

    // 1) Invite the user via Supabase Auth Admin API
    console.log('[invite-and-add] Attempting to invite user with email:', email)
    console.log('[invite-and-add] Admin client created, calling inviteUserByEmail...')

    const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
      data: {
        name: name || email.split('@')[0]
      },
      redirectTo
    })

    console.log('[invite-and-add] Invite response:', {
      hasData: !!invited,
      hasError: !!inviteErr,
      errorMessage: inviteErr?.message,
      userId: invited?.user?.id,
      userEmail: invited?.user?.email
    })

    if (inviteErr) {
      console.error('[invite-and-add] Failed to invite user - Full error:', {
        message: inviteErr.message,
        status: inviteErr.status,
        code: inviteErr.code,
        name: inviteErr.name
      })
      return NextResponse.json(
        {
          ok: false,
          error: inviteErr.message,
          details: {
            code: inviteErr.code,
            status: inviteErr.status
          }
        },
        { status: 400 }
      )
    }

    const userId = invited?.user?.id
    if (!userId) {
      console.error('[invite-and-add] No user ID returned from invitation. Full response:', invited)
      return NextResponse.json(
        { ok: false, error: 'Failed to create user - no ID returned' },
        { status: 500 }
      )
    }

    console.log('[invite-and-add] User created/invited successfully, ID:', userId)
    console.log('[invite-and-add] User details:', {
      id: invited.user.id,
      email: invited.user.email,
      email_confirmed_at: invited.user.email_confirmed_at,
      confirmation_sent_at: invited.user.confirmation_sent_at
    })

    // 2) Add user to profiles table
    const { error: profileError } = await admin
      .from('profiles')
      .upsert({
        id: userId,
        email: email.toLowerCase(),
        name: name || email.split('@')[0]
      }, {
        onConflict: 'id'
      })

    if (profileError) {
      console.error('[invite-and-add] Profile upsert error (non-fatal):', profileError)
    }

    // 3) Add to agency directly (service role bypasses RLS)
    const { error: memberError } = await admin
      .from('user_agencies')
      .upsert({
        user_id: userId,
        agency_id: agencyId,
        role: role || 'agent',
        created_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,agency_id'
      })

    if (memberError) {
      console.error('[invite-and-add] Failed to add user to agency:', memberError)

      // Check if it's a duplicate entry
      if (memberError.message?.includes('duplicate') || memberError.code === '23505') {
        return NextResponse.json(
          { ok: false, error: 'User is already a member of this agency' },
          { status: 400 }
        )
      }

      return NextResponse.json(
        { ok: false, error: `Failed to add user to agency: ${memberError.message}` },
        { status: 400 }
      )
    }

    console.log('[invite-and-add] User successfully added to agency')

    return NextResponse.json({
      ok: true,
      userId,
      message: 'User invited and added to agency successfully'
    })
  } catch (error) {
    console.error('[invite-and-add] Unexpected error:', error)
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}