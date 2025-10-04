import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import crypto from 'crypto';
import { logError } from '@/lib/log';

// Get encryption key with proper error handling
function getEncryptionKey(): Buffer | null {
  const key = process.env.CONVOSO_ENCRYPTION_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    return null;
  }
  return crypto.createHash('sha256').update(key).digest();
}

function encrypt(text: string): string {
  const encryptionKey = getEncryptionKey();
  if (!encryptionKey) {
    throw new Error('CONVOSO_ENCRYPTION_KEY or SUPABASE_SERVICE_ROLE_KEY must be set for credential encryption');
  }

  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', encryptionKey, iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text: string): string {
  try {
    const encryptionKey = getEncryptionKey();
    if (!encryptionKey) {
      logError('Missing encryption key', new Error('Cannot decrypt without encryption key'), {});
      return '';
    }

    const parts = text.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedText = Buffer.from(parts[1], 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', encryptionKey, iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (error: any) {
    logError('Decryption error', error, {
      error_message: error.message
    });
    return '';
  }
}

export async function GET() {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's agency
    const { data: membership, error: memberError } = await supabase
      .from('user_agencies')
      .select('agency_id, role')
      .eq('user_id', user.id)
      .single();

    if (memberError || !membership) {
      return NextResponse.json({ error: 'No agency found' }, { status: 404 });
    }

    // Only admin and super admin can view credentials
    if (!['admin', 'super_admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    // Get agency's Convoso credentials
    const { data: agency, error: agencyError } = await supabase
      .from('agencies')
      .select('convoso_auth_token, convoso_base_url')
      .eq('id', membership.agency_id)
      .single();

    if (agencyError) {
      logError('Failed to get agency', agencyError, {
        agency_id: membership.agency_id,
        user_id: user.id
      });
      return NextResponse.json({ error: 'Failed to get credentials' }, { status: 500 });
    }

    // Check if credentials exist (don't send actual values for security)
    const hasCredentials = !!agency?.convoso_auth_token;

    return NextResponse.json({
      hasCredentials,
      base_url: agency?.convoso_base_url || 'https://api.convoso.com/v1'
    });

  } catch (error: any) {
    logError('Failed to get Convoso credentials', error, {
      error_message: error.message
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const body = await req.json();

    const { auth_token, base_url } = body;

    if (!auth_token) {
      return NextResponse.json(
        { error: 'Auth token is required' },
        { status: 400 }
      );
    }

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's agency
    const { data: membership, error: memberError } = await supabase
      .from('user_agencies')
      .select('agency_id, role')
      .eq('user_id', user.id)
      .single();

    if (memberError || !membership) {
      return NextResponse.json({ error: 'No agency found' }, { status: 404 });
    }

    // Only admin and super admin can update credentials
    if (!['admin', 'super_admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    // Don't encrypt masked placeholder values
    const shouldEncrypt = auth_token !== '••••••••';

    // Encrypt credentials before storing
    const encryptedAuthToken = shouldEncrypt ? encrypt(auth_token) : undefined;

    // Build update object conditionally
    const updateData: any = {
      convoso_base_url: base_url || 'https://api.convoso.com/v1',
      updated_at: new Date().toISOString()
    };

    // Only update credentials if they're not masked placeholders
    if (encryptedAuthToken) {
      updateData.convoso_auth_token = encryptedAuthToken;
    }

    // Update agency with encrypted credentials
    const { error: updateError } = await supabase
      .from('agencies')
      .update(updateData)
      .eq('id', membership.agency_id);

    if (updateError) {
      logError('Failed to update credentials', updateError, {
        agency_id: membership.agency_id,
        user_id: user.id
      });
      return NextResponse.json(
        { error: 'Failed to save credentials' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });

  } catch (error: any) {
    logError('Failed to save Convoso credentials', error, {
      error_message: error.message
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}