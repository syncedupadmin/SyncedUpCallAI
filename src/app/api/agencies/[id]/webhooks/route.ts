import { NextRequest, NextResponse } from 'next/server';
import { withStrictAgencyIsolation, createSecureClient } from '@/lib/security/agency-isolation';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

// ============================================================================
// Helper: Generate webhook token
// ============================================================================

function generateWebhookToken(): string {
  const randomBytes = crypto.randomBytes(16);
  const hexString = randomBytes.toString('hex');
  return `agt_${hexString}`;
}

// ============================================================================
// GET /api/agencies/[id]/webhooks - List all webhook tokens for an agency
// ============================================================================

export const GET = withStrictAgencyIsolation(async (req, context) => {
  const agencyId = req.nextUrl.pathname.split('/')[3];

  // SECURITY: Validate user has access to this agency
  if (!context.agencyIds.includes(agencyId)) {
    console.error(`[SECURITY] User ${context.userId} attempted to list webhooks for agency ${agencyId} without permission`);
    return NextResponse.json({ error: 'Agency not found' }, { status: 404 });
  }

  try {
    const supabase = createSecureClient();

    const { data: tokens, error } = await supabase
      .from('webhook_tokens')
      .select('id, name, description, created_at, last_used_at, usage_count, is_active, token')
      .eq('agency_id', agencyId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error(`[SECURITY] Error listing webhooks for user ${context.userId}:`, error);
      return NextResponse.json({
        ok: false,
        error: 'Failed to list webhook tokens'
      }, { status: 500 });
    }

    // Transform tokens to hide full token value (show preview only)
    const tokenList = tokens?.map(token => ({
      id: token.id,
      name: token.name,
      description: token.description,
      created_at: token.created_at,
      last_used_at: token.last_used_at,
      usage_count: token.usage_count,
      is_active: token.is_active,
      token_preview: token.token ? `${token.token.substring(0, 12)}...${token.token.substring(token.token.length - 4)}` : null
    })) || [];

    return NextResponse.json({
      ok: true,
      tokens: tokenList
    });
  } catch (error: any) {
    console.error(`[SECURITY] Error in GET webhooks for user ${context.userId}:`, error);
    return NextResponse.json({
      ok: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
});

// ============================================================================
// POST /api/agencies/[id]/webhooks - Create new webhook token
// ============================================================================

export const POST = withStrictAgencyIsolation(async (req, context) => {
  const agencyId = req.nextUrl.pathname.split('/')[3];

  // SECURITY: Validate user has access to this agency
  if (!context.agencyIds.includes(agencyId)) {
    console.error(`[SECURITY] User ${context.userId} attempted to create webhook for agency ${agencyId} without permission`);
    return NextResponse.json({ error: 'Agency not found' }, { status: 404 });
  }

  // SECURITY: Only owners and admins can create tokens
  if (context.role !== 'owner' && context.role !== 'admin') {
    console.error(`[SECURITY] User ${context.userId} with role ${context.role} attempted to create webhook token`);
    return NextResponse.json({
      ok: false,
      error: 'Only agency owners and admins can create webhook tokens'
    }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { name, description } = body;

    if (!name || typeof name !== 'string') {
      return NextResponse.json({
        ok: false,
        error: 'Token name is required'
      }, { status: 400 });
    }

    // Generate secure token
    const token = generateWebhookToken();

    const supabase = createSecureClient();

    const { data: newToken, error } = await supabase
      .from('webhook_tokens')
      .insert({
        agency_id: agencyId,
        token: token,
        name: name.trim(),
        description: description?.trim() || null,
        created_by: context.userId,
        is_active: true
      })
      .select()
      .single();

    if (error) {
      console.error(`[SECURITY] Error creating webhook token for user ${context.userId}:`, error);
      return NextResponse.json({
        ok: false,
        error: 'Failed to create webhook token'
      }, { status: 500 });
    }

    console.log(`[SECURITY] User ${context.userId} created webhook token ${newToken.id} for agency ${agencyId}`);

    // Return full token ONLY on creation (user needs to save it)
    return NextResponse.json({
      ok: true,
      token: {
        id: newToken.id,
        name: newToken.name,
        description: newToken.description,
        token: newToken.token, // ✅ Full token shown ONLY here
        created_at: newToken.created_at,
        webhook_url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.com'}/api/webhooks/convoso-calls`
      },
      instructions: `Add this header to your Convoso webhook configuration:\n\nX-Agency-Token: ${newToken.token}\n\n⚠️ Save this token securely - you won't be able to see it again!`
    });
  } catch (error: any) {
    console.error(`[SECURITY] Error in POST webhooks for user ${context.userId}:`, error);
    return NextResponse.json({
      ok: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
});