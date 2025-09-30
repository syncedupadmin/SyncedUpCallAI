import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sbAdmin } from '@/lib/supabase-admin';

export async function POST(req: NextRequest) {
  try {
    const {
      company_name,
      admin_email,
      admin_name,
      admin_password,
      company_phone,
      company_website
    } = await req.json();

    // Validate required fields
    if (!company_name || !admin_email || !admin_password) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Use admin client to bypass RLS
    const supabase = sbAdmin;

    // Check if email already exists
    const { data: existingUser } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', admin_email)
      .single();

    if (existingUser) {
      return NextResponse.json(
        { error: 'Email already registered' },
        { status: 400 }
      );
    }

    // Step 1: Create the user account
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: admin_email,
      password: admin_password,
      email_confirm: false, // Require email confirmation
      user_metadata: {
        name: admin_name || company_name
      }
    });

    if (authError) {
      console.error('Auth creation error:', authError);
      return NextResponse.json(
        { error: 'Failed to create user account' },
        { status: 500 }
      );
    }

    const userId = authData.user.id;

    // Step 2: Create the agency
    const { data: agency, error: agencyError } = await supabase
      .from('agencies')
      .insert({
        name: company_name,
        slug: company_name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
        owner_user_id: userId,
        discovery_status: 'pending',
        settings: {
          phone: company_phone,
          website: company_website,
          trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
          subscription_status: 'trial',
          plan: 'trial'
        }
      })
      .select()
      .single();

    if (agencyError) {
      console.error('Agency creation error:', agencyError);
      // Clean up user if agency creation fails
      await supabase.auth.admin.deleteUser(userId);
      return NextResponse.json(
        { error: 'Failed to create agency' },
        { status: 500 }
      );
    }

    // Step 3: Add user to agency as owner
    const { error: memberError } = await supabase
      .from('user_agencies')
      .insert({
        user_id: userId,
        agency_id: agency.id,
        role: 'owner'
      });

    if (memberError) {
      console.error('Member creation error:', memberError);
    }

    // Step 4: Create user profile
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: userId,
        email: admin_email,
        full_name: admin_name || company_name,
        role: 'agency_owner'
      });

    if (profileError) {
      console.error('Profile creation error:', profileError);
    }

    // Return success - user must verify email before logging in
    return NextResponse.json({
      success: true,
      agency: {
        id: agency.id,
        name: agency.name,
        slug: agency.slug
      },
      message: 'Registration successful! Please check your email to confirm your account.',
      next_step: 'email_confirmation'
    });

  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: 'Internal server error during registration' },
      { status: 500 }
    );
  }
}