/**
 * Webhook Authentication Module
 * Handles agency token validation for incoming webhooks
 */

import { NextRequest } from 'next/server';
import { sbAdmin } from '@/lib/supabase-admin';

// ============================================================================
// Type Definitions
// ============================================================================

export interface WebhookAuthResult {
  success: boolean;
  agencyId: string | null;
  error?: string;
  tokenId?: string;
}

// ============================================================================
// Token Validation
// ============================================================================

/**
 * Validates webhook token and returns associated agency_id
 * Uses service role client to bypass RLS
 */
export async function getAgencyFromWebhookToken(token: string): Promise<string | null> {
  // Validate token format
  if (!token || !token.startsWith('agt_')) {
    return null;
  }

  try {
    // Look up token in database (using admin client to bypass RLS)
    const { data, error } = await sbAdmin
      .from('webhook_tokens')
      .select('id, agency_id, is_active, usage_count')
      .eq('token', token)
      .eq('is_active', true)
      .single();

    if (error || !data) {
      return null;
    }

    // Update usage stats (fire and forget - don't wait for response)
    const updateResult = await sbAdmin
      .from('webhook_tokens')
      .update({
        last_used_at: new Date().toISOString(),
        usage_count: (data.usage_count || 0) + 1
      })
      .eq('id', data.id);

    if (updateResult.error) {
      console.error('[WEBHOOK_AUTH] Failed to update token usage:', updateResult.error);
    }

    return data.agency_id;
  } catch (error) {
    console.error('[WEBHOOK_AUTH] Error validating token:', error);
    return null;
  }
}

// ============================================================================
// Webhook Authentication
// ============================================================================

/**
 * Authenticates incoming webhook request and returns agency_id
 * Supports both new token-based auth and legacy secret auth
 */
export async function authenticateWebhook(req: NextRequest): Promise<WebhookAuthResult> {
  // PRIORITY 1: Check for agency token (preferred method)
  const agencyToken = req.headers.get('x-agency-token');

  if (agencyToken) {
    const agencyId = await getAgencyFromWebhookToken(agencyToken);

    if (agencyId) {
      return {
        success: true,
        agencyId,
      };
    }

    // Token was provided but invalid
    return {
      success: false,
      agencyId: null,
      error: 'Invalid or inactive webhook token'
    };
  }

  // PRIORITY 2: Check for legacy webhook secret (backward compatibility)
  // Also check Authorization header as Convoso might send it there
  const webhookSecret = req.headers.get('x-webhook-secret') ||
                        req.headers.get('authorization')?.replace('Bearer ', '') ||
                        req.headers.get('x-api-key');

  if (webhookSecret && process.env.CONVOSO_WEBHOOK_SECRET) {
    if (webhookSecret === process.env.CONVOSO_WEBHOOK_SECRET) {
      // Valid legacy secret - use default agency if configured
      const defaultAgencyId = process.env.DEFAULT_AGENCY_ID || 'default_agency';

      console.warn('[WEBHOOK_AUTH] Using legacy webhook secret with default agency. Please migrate to token-based auth.');

      return {
        success: true,
        agencyId: defaultAgencyId,
      };
    }

    // Invalid legacy secret
    return {
      success: false,
      agencyId: null,
      error: 'Invalid webhook secret'
    };
  }

  // PRIORITY 3: Check if Convoso is calling without any auth headers
  // This is a temporary fix for the production issue
  if (process.env.CONVOSO_WEBHOOK_SECRET) {
    // If CONVOSO_WEBHOOK_SECRET is configured but no auth provided,
    // assume it's Convoso calling (they might not send headers)
    const userAgent = req.headers.get('user-agent') || '';
    const isLikelyConvoso = userAgent.toLowerCase().includes('convoso') ||
                            req.headers.get('x-convoso-webhook') ||
                            req.url.includes('convoso');

    if (isLikelyConvoso || process.env.ALLOW_NO_AUTH_WEBHOOKS === 'true') {
      const defaultAgencyId = process.env.DEFAULT_AGENCY_ID || 'default_agency';

      console.warn('[WEBHOOK_AUTH] Accepting webhook without auth headers (Convoso compatibility mode)');

      return {
        success: true,
        agencyId: defaultAgencyId,
      };
    }
  }

  // PRIORITY 4: No authentication provided
  // Check if authentication is required
  const requireAuth = process.env.REQUIRE_WEBHOOK_AUTH !== 'false';

  if (!requireAuth) {
    // Authentication not required (testing/development mode)
    console.warn('[WEBHOOK_AUTH] Webhook authentication not required. This should ONLY be used in development!');

    const defaultAgencyId = process.env.DEFAULT_AGENCY_ID || 'default_agency';

    return {
      success: true,
      agencyId: defaultAgencyId,
    };
  }

  // No authentication provided and auth is required
  return {
    success: false,
    agencyId: null,
    error: 'Missing authentication. Include X-Agency-Token or X-Webhook-Secret header.'
  };
}

// ============================================================================
// Helper: Validate webhook request has agency_id
// ============================================================================

/**
 * Validates that a webhook request is properly authenticated
 * Returns agency_id if valid, or throws error with appropriate HTTP status
 */
export async function requireWebhookAuth(req: NextRequest): Promise<string> {
  const authResult = await authenticateWebhook(req);

  if (!authResult.success || !authResult.agencyId) {
    throw new Error(authResult.error || 'Authentication failed');
  }

  return authResult.agencyId;
}