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
        { error: 'Please fill in all required fields' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(admin_email)) {
      return NextResponse.json(
        { error: 'Please enter a valid email address' },
        { status: 400 }
      );
    }

    // Validate password strength
    if (admin_password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters long' },
        { status: 400 }
      );
    }

    if (!/[A-Z]/.test(admin_password)) {
      return NextResponse.json(
        { error: 'Password must contain at least one uppercase letter' },
        { status: 400 }
      );
    }

    if (!/[a-z]/.test(admin_password)) {
      return NextResponse.json(
        { error: 'Password must contain at least one lowercase letter' },
        { status: 400 }
      );
    }

    if (!/[0-9]/.test(admin_password)) {
      return NextResponse.json(
        { error: 'Password must contain at least one number' },
        { status: 400 }
      );
    }

    // Validate admin name (must have first and last name)
    if (admin_name) {
      const nameParts = admin_name.trim().split(/\s+/);
      if (nameParts.length < 2) {
        return NextResponse.json(
          { error: 'Please provide both first and last name' },
          { status: 400 }
        );
      }

      if (!/^[a-zA-Z\s'-]+$/.test(admin_name)) {
        return NextResponse.json(
          { error: 'Name can only contain letters, spaces, hyphens, and apostrophes' },
          { status: 400 }
        );
      }
    }

    // Validate company name
    if (company_name.length < 2) {
      return NextResponse.json(
        { error: 'Company name must be at least 2 characters' },
        { status: 400 }
      );
    }

    if (company_name.length > 100) {
      return NextResponse.json(
        { error: 'Company name is too long (maximum 100 characters)' },
        { status: 400 }
      );
    }

    // Use admin client to bypass RLS
    const supabase = sbAdmin;

    // Check if email already exists in auth
    const { data: existingAuthUsers } = await supabase.auth.admin.listUsers();
    const emailExists = existingAuthUsers.users.some(u => u.email === admin_email);

    if (emailExists) {
      return NextResponse.json(
        { error: 'This email is already registered. Please use a different email or try logging in.' },
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

      // Handle specific auth errors
      if (authError.message?.includes('email')) {
        return NextResponse.json(
          { error: 'This email is already in use. Please use a different email address.' },
          { status: 400 }
        );
      }

      if (authError.message?.includes('password')) {
        return NextResponse.json(
          { error: 'Password does not meet security requirements. Please use a stronger password.' },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { error: 'Unable to create account. Please try again or contact support.' },
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

      // Handle specific agency errors
      if (agencyError.code === '23505' && agencyError.message?.includes('slug')) {
        return NextResponse.json(
          { error: 'A company with this name already exists. Please use a different company name.' },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { error: 'Unable to create agency. Please try again or contact support.' },
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
      // Non-critical, continue
    }

    // Note: Profile is automatically created by database trigger on_auth_user_created

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