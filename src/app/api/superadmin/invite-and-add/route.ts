import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: Request) {
  try {
    const { email, name, agencyId, role } = await req.json()

    // Validate required fields
    if (!email || !agencyId) {
      return NextResponse.json(
        { ok: false, error: 'Email and agency ID are required' },
        { status: 400 }
      )
    }

    // Create admin client with service role key
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY! // service role required for admin operations
    )

    // 1) Create or invite the user
    const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { name: name || email.split('@')[0] } // Use email prefix as name if not provided
    })

    if (inviteErr) {
      return NextResponse.json(
        { ok: false, error: inviteErr.message },
        { status: 400 }
      )
    }

    const userId = invited.user?.id
    if (!userId) {
      return NextResponse.json(
        { ok: false, error: 'No user ID returned from invitation' },
        { status: 400 }
      )
    }

    // 2) Add user to profiles table if they don't exist
    // This ensures the user has a profile record
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
      console.error('Error creating profile:', profileError)
      // Don't fail the request, profile might already exist
    }

    // 3) Add to agency via RPC (or directly if RPC doesn't exist)
    const { data: rpcData, error: rpcError } = await admin.rpc('add_user_to_agency', {
      p_agency: agencyId,
      p_user: userId,
      p_role: role ?? 'agent'
    })

    if (rpcError) {
      // If RPC doesn't exist, try direct insert
      if (rpcError.message?.includes('function') || rpcError.message?.includes('does not exist')) {
        const { error: insertError } = await admin
          .from('user_agencies')
          .insert({
            user_id: userId,
            agency_id: agencyId,
            role: role ?? 'agent'
          })

        if (insertError) {
          if (insertError.code === '23505') {
            return NextResponse.json(
              { ok: false, error: 'User is already a member of this agency' },
              { status: 400 }
            )
          }
          return NextResponse.json(
            { ok: false, error: insertError.message },
            { status: 400 }
          )
        }
      } else {
        return NextResponse.json(
          { ok: false, error: rpcError.message },
          { status: 400 }
        )
      }
    }

    return NextResponse.json({
      ok: true,
      userId,
      message: 'User invited and added to agency successfully'
    })
  } catch (error) {
    console.error('Error in invite-and-add:', error)
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}