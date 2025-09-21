import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET() {
  try {
    // Check environment variables
    const config = {
      hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      siteUrl: process.env.NEXT_PUBLIC_SITE_URL || process.env.APP_URL || 'Not set',
      inviteRedirectTo: process.env.INVITE_REDIRECT_TO || 'Not set (using default)',
    }

    // Try to create admin client
    if (!config.hasServiceKey || !config.hasSupabaseUrl) {
      return NextResponse.json({
        ok: false,
        error: 'Missing required environment variables',
        config,
        emailTestSkipped: true
      })
    }

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Test creating a user (we'll immediately delete it)
    const testEmail = `test-${Date.now()}@example.com`
    console.log('[check-email-config] Testing with email:', testEmail)

    // Try to invite a test user
    const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(testEmail, {
      data: { name: 'Test User' },
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://synced-up-call-ai.vercel.app'}/auth/callback`
    })

    let emailTestResult = {
      testEmail,
      inviteSuccess: false,
      inviteError: null as any,
      userId: null as string | null,
      emailDetails: null as any
    }

    if (inviteErr) {
      emailTestResult.inviteError = {
        message: inviteErr.message,
        code: inviteErr.code,
        status: inviteErr.status
      }
    } else if (invited?.user) {
      emailTestResult.inviteSuccess = true
      emailTestResult.userId = invited.user.id
      emailTestResult.emailDetails = {
        email_confirmed_at: invited.user.email_confirmed_at,
        confirmation_sent_at: invited.user.confirmation_sent_at,
        invited_at: invited.user.invited_at,
        created_at: invited.user.created_at
      }

      // Clean up - delete the test user
      try {
        await admin.auth.admin.deleteUser(invited.user.id)
        console.log('[check-email-config] Test user cleaned up')
      } catch (deleteErr) {
        console.error('[check-email-config] Failed to clean up test user:', deleteErr)
      }
    }

    // Get auth configuration
    const { data: authConfig } = await admin.auth.admin.getConfig()

    return NextResponse.json({
      ok: true,
      config,
      emailTest: emailTestResult,
      authSettings: {
        smtp_configured: authConfig?.smtp?.enable || false,
        email_enabled: authConfig?.mailer?.autoconfirm === false,
        site_url: authConfig?.site_url,
        redirect_urls: authConfig?.redirect_urls
      },
      recommendations: getRecommendations(config, emailTestResult, authConfig)
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

function getRecommendations(config: any, emailTest: any, authConfig: any) {
  const recommendations = []

  if (!config.hasServiceKey) {
    recommendations.push('❌ Add SUPABASE_SERVICE_ROLE_KEY to environment variables')
  }

  if (config.siteUrl === 'Not set') {
    recommendations.push('⚠️ Set NEXT_PUBLIC_SITE_URL or APP_URL for proper email redirects')
  }

  if (!authConfig?.smtp?.enable) {
    recommendations.push('❌ SMTP not configured in Supabase. Emails will not be sent in production.')
    recommendations.push('   Go to Supabase Dashboard → Settings → Auth → SMTP Settings')
    recommendations.push('   Or use a service like SendGrid, Resend, or AWS SES')
  }

  if (emailTest.inviteError?.code === 'over_email_send_rate_limit') {
    recommendations.push('⚠️ Email rate limit reached. Default Supabase limit is 4 emails/hour')
    recommendations.push('   Configure custom SMTP to remove this limit')
  }

  if (!emailTest.inviteSuccess && emailTest.inviteError) {
    recommendations.push(`❌ Email invite failed: ${emailTest.inviteError.message}`)
  }

  if (recommendations.length === 0) {
    recommendations.push('✅ Email configuration looks good!')
  }

  return recommendations
}