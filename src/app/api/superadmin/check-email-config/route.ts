import { NextResponse } from 'next/server'

export async function GET() {
  try {
    // ALWAYS skip email test - this should never send actual emails
    // This endpoint should only return configuration status
    console.log('[check-email-config] Email test disabled - returning config only');

    // Check environment variables
    const config = {
      hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      siteUrl: process.env.NEXT_PUBLIC_SITE_URL || process.env.APP_URL || 'Not set',
      inviteRedirectTo: process.env.INVITE_REDIRECT_TO || 'Not set (using default)',
      environment: process.env.NODE_ENV,
      vercelEnv: process.env.VERCEL_ENV || 'not-on-vercel'
    }

    const recommendations = []

    if (!config.hasServiceKey) {
      recommendations.push('❌ Add SUPABASE_SERVICE_ROLE_KEY to environment variables')
    }

    if (!config.hasSupabaseUrl) {
      recommendations.push('❌ Add NEXT_PUBLIC_SUPABASE_URL to environment variables')
    }

    if (!config.hasAnonKey) {
      recommendations.push('❌ Add NEXT_PUBLIC_SUPABASE_ANON_KEY to environment variables')
    }

    if (config.siteUrl === 'Not set') {
      recommendations.push('⚠️ Set NEXT_PUBLIC_SITE_URL or APP_URL for proper email redirects')
    }

    if (recommendations.length === 0) {
      recommendations.push('✅ Basic configuration looks good!')
      recommendations.push('ℹ️ Email testing has been disabled to prevent unwanted test emails')
    }

    return NextResponse.json({
      ok: true,
      config,
      emailTestSkipped: true,
      message: 'Email testing has been permanently disabled to prevent unwanted emails',
      recommendations
    })
  } catch (error) {
    console.error('[check-email-config] Unexpected error:', error)
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : 'Unexpected error',
      details: error
    }, { status: 500 })
  }
}