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
    const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
      data: {
        name: name || email.split('@')[0]
      },
      redirectTo
    })

    if (inviteErr) {
      console.error('[invite-and-add] Failed to invite user:', inviteErr)
      return NextResponse.json(
        { ok: false, error: inviteErr.message },
        { status: 400 }
      )
    }

    const userId = invited.user?.id
    if (!userId) {
      console.error('[invite-and-add] No user ID returned from invitation')
      return NextResponse.json(
        { ok: false, error: 'Failed to create user - no ID returned' },
        { status: 500 }
      )
    }

    console.log('[invite-and-add] User invited successfully, ID:', userId)

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

    // 3) Add to agency via RPC only (no direct table access)
    const { error: rpcError } = await admin.rpc('add_user_to_agency', {
      p_agency: agencyId,
      p_user: userId,
      p_role: role || 'agent'
    })

    if (rpcError) {
      console.error('[invite-and-add] Failed to add user to agency:', rpcError)

      // Check if it's a duplicate entry
      if (rpcError.message?.includes('duplicate') || rpcError.code === '23505') {
        return NextResponse.json(
          { ok: false, error: 'User is already a member of this agency' },
          { status: 400 }
        )
      }

      return NextResponse.json(
        { ok: false, error: `Failed to add user to agency: ${rpcError.message}` },
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