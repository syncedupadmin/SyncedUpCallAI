import { NextRequest, NextResponse } from 'next/server';
import { withStrictAgencyIsolation, createSecureClient } from '@/lib/security/agency-isolation';

export const dynamic = 'force-dynamic';

// ============================================================================
// DELETE /api/agencies/[id]/webhooks/[tokenId] - Revoke webhook token
// ============================================================================

export const DELETE = withStrictAgencyIsolation(async (req, context) => {
  const pathParts = req.nextUrl.pathname.split('/');
  const agencyId = pathParts[3];
  const tokenId = pathParts[5];

  // SECURITY: Validate user has access to this agency
  if (!context.agencyIds.includes(agencyId)) {
    console.error(`[SECURITY] User ${context.userId} attempted to delete webhook for agency ${agencyId} without permission`);
    return NextResponse.json({ error: 'Agency not found' }, { status: 404 });
  }

  // SECURITY: Only owners and admins can delete tokens
  if (context.role !== 'owner' && context.role !== 'admin') {
    console.error(`[SECURITY] User ${context.userId} with role ${context.role} attempted to delete webhook token`);
    return NextResponse.json({
      ok: false,
      error: 'Only agency owners and admins can revoke webhook tokens'
    }, { status: 403 });
  }

  try {
    const supabase = createSecureClient();

    // First, verify the token exists and belongs to this agency
    const { data: existingToken, error: fetchError } = await supabase
      .from('webhook_tokens')
      .select('id, name, agency_id')
      .eq('id', tokenId)
      .eq('agency_id', agencyId)
      .single();

    if (fetchError || !existingToken) {
      console.error(`[SECURITY] User ${context.userId} attempted to delete non-existent token ${tokenId}`);
      return NextResponse.json({
        ok: false,
        error: 'Webhook token not found'
      }, { status: 404 });
    }

    // Soft delete: Mark as inactive instead of hard delete
    // This preserves audit trail and usage history
    const { error: updateError } = await supabase
      .from('webhook_tokens')
      .update({ is_active: false })
      .eq('id', tokenId)
      .eq('agency_id', agencyId);

    if (updateError) {
      console.error(`[SECURITY] Error revoking webhook token for user ${context.userId}:`, updateError);
      return NextResponse.json({
        ok: false,
        error: 'Failed to revoke webhook token'
      }, { status: 500 });
    }

    console.log(`[SECURITY] User ${context.userId} revoked webhook token ${tokenId} (${existingToken.name}) for agency ${agencyId}`);

    return NextResponse.json({
      ok: true,
      message: 'Webhook token revoked successfully',
      token: {
        id: existingToken.id,
        name: existingToken.name
      }
    });
  } catch (error: any) {
    console.error(`[SECURITY] Error in DELETE webhook token for user ${context.userId}:`, error);
    return NextResponse.json({
      ok: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
});