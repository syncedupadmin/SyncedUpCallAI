import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { isAdminAuthenticated } from '@/server/auth/admin';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // 1 minute for file processing

interface UploadResult {
  success: boolean;
  processed: number;
  failed: number;
  errors: string[];
  duplicates: number;
  created: number;
  updated: number;
}

// Parse CSV content
function parseCSV(content: string): { headers: string[]; rows: any[] } {
  const lines = content.split('\n').filter(line => line.trim());
  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const rows = lines.slice(1).map((line, index) => {
    const values = line.match(/(".*?"|[^,]+)/g) || [];
    const row: any = { _row: index + 2 };
    headers.forEach((header, i) => {
      const value = values[i] || '';
      row[header] = value.trim().replace(/^"|"$/g, '');
    });
    return row;
  });

  return { headers, rows };
}

// Validate and process calls data with batch processing
async function processCalls(rows: any[]): Promise<UploadResult> {
  const result: UploadResult = {
    success: true,
    processed: 0,
    failed: 0,
    errors: [],
    duplicates: 0,
    created: 0,
    updated: 0
  };

  // Process in batches for better performance
  const BATCH_SIZE = 100;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const toInsert = [];
    const toUpdate = [];

    // Prepare batch data
    for (const row of batch) {
      try {
        result.processed++;

        // Validate required fields - need either lead_id OR call_id
        if (!row.lead_id && !row.call_id) {
          result.failed++;
          if (result.errors.length < 10) {
            result.errors.push(`Row ${row._row}: Missing lead_id or call_id`);
          }
          continue;
        }

        // Parse duration
        const duration = row.duration_sec ? parseInt(row.duration_sec) : null;

        // Parse dates safely
        let startedAt = null;
        let endedAt = null;
        try {
          if (row.started_at) startedAt = new Date(row.started_at).toISOString();
          if (row.ended_at) endedAt = new Date(row.ended_at).toISOString();
        } catch (e) {
          // Invalid date format, leave as null
        }

        const callData = {
          call_id: row.call_id || `BULK-${Date.now()}-${row._row}`,
          source_ref: row.call_id,
          lead_id: row.lead_id || null,
          phone_number: row.phone_number || null,
          agent_name: row.agent_name || null,
          disposition: row.disposition || null,
          duration_sec: duration,
          started_at: startedAt,
          ended_at: endedAt,
          campaign: row.campaign || null,
          recording_url: row.recording_url || null
        };

        toInsert.push(callData);
      } catch (error: any) {
        result.failed++;
        if (result.errors.length < 10) {
          result.errors.push(`Row ${row._row}: ${error.message}`);
        }
      }
    }

    // Batch insert with ON CONFLICT handling
    if (toInsert.length > 0) {
      try {
        const values = toInsert.map((call, idx) =>
          `($${idx * 12 + 1}, $${idx * 12 + 2}, $${idx * 12 + 3}, $${idx * 12 + 4}, $${idx * 12 + 5}, $${idx * 12 + 6}, $${idx * 12 + 7}, $${idx * 12 + 8}, $${idx * 12 + 9}, $${idx * 12 + 10}, $${idx * 12 + 11}, $${idx * 12 + 12})`
        ).join(',');

        const params = toInsert.flatMap(call => [
          'bulk_upload',
          call.call_id,
          call.source_ref,
          call.lead_id,
          call.phone_number,
          call.agent_name,
          call.disposition,
          call.duration_sec,
          call.started_at,
          call.ended_at,
          call.campaign,
          call.recording_url
        ]);

        const query = `
          INSERT INTO calls (
            source, call_id, source_ref, lead_id, phone_number, agent_name, disposition,
            duration_sec, started_at, ended_at, campaign, recording_url
          ) VALUES ${values}
          ON CONFLICT (call_id)
          DO UPDATE SET
            lead_id = COALESCE(EXCLUDED.lead_id, calls.lead_id),
            phone_number = COALESCE(EXCLUDED.phone_number, calls.phone_number),
            agent_name = COALESCE(EXCLUDED.agent_name, calls.agent_name),
            disposition = COALESCE(EXCLUDED.disposition, calls.disposition),
            duration_sec = COALESCE(EXCLUDED.duration_sec, calls.duration_sec),
            started_at = COALESCE(EXCLUDED.started_at, calls.started_at),
            ended_at = COALESCE(EXCLUDED.ended_at, calls.ended_at),
            campaign = COALESCE(EXCLUDED.campaign, calls.campaign),
            recording_url = COALESCE(EXCLUDED.recording_url, calls.recording_url),
            updated_at = NOW()
          RETURNING (xmax = 0) as inserted
        `;

        const results = await db.manyOrNone(query, params);

        results.forEach(r => {
          if (r.inserted) {
            result.created++;
          } else {
            result.updated++;
          }
        });
      } catch (error: any) {
        console.error('Batch insert error:', error);
        result.failed += toInsert.length;
        if (result.errors.length < 10) {
          result.errors.push(`Batch error: ${error.message}`);
        }
      }
    }
  }

  if (result.errors.length >= 10) {
    result.errors.push(`...and ${result.failed - 10} more errors`);
  }

  return result;
}

// Validate and process leads data with batch processing
async function processLeads(rows: any[]): Promise<UploadResult> {
  const result: UploadResult = {
    success: true,
    processed: 0,
    failed: 0,
    errors: [],
    duplicates: 0,
    created: 0,
    updated: 0
  };

  const supabase = await createClient();

  // Process in batches for better performance
  const BATCH_SIZE = 100;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const toInsert = [];

    for (const row of batch) {
      try {
        result.processed++;

        // Validate required fields (allow lead_id only if provided)
        if (!row.lead_id && !row.email && !row.phone_number) {
          result.failed++;
          if (result.errors.length < 10) {
            result.errors.push(`Row ${row._row}: Missing lead_id, email, or phone_number`);
          }
          continue;
        }

        // Check for existing contact by lead_id first (Convoso), then email/phone
        let existingContact = null;
        if (row.lead_id) {
          existingContact = await db.oneOrNone(
            'SELECT id FROM contacts WHERE lead_id = $1',
            [row.lead_id]
          );
        }

        if (!existingContact && (row.email || row.phone_number)) {
          existingContact = await db.oneOrNone(
            'SELECT id FROM contacts WHERE email = $1 OR primary_phone = $2',
            [row.email || null, row.phone_number || null]
          );
        }

        if (existingContact) {
          // Update existing contact with new data
          await db.none(`
            UPDATE contacts SET
              first_name = COALESCE($1, first_name),
              last_name = COALESCE($2, last_name),
              email = COALESCE($3, email),
              primary_phone = COALESCE($4, primary_phone),
              address = COALESCE($5, address),
              city = COALESCE($6, city),
              state = COALESCE($7, state),
              zip_code = COALESCE($8, zip_code),
              status = COALESCE($9, status),
              updated_at = NOW()
            WHERE id = $10
          `, [
            row.first_name || null,
            row.last_name || null,
            row.email || null,
            row.phone_number || null,
            row.address || null,
            row.city || null,
            row.state || null,
            row.zip || row.zip_code || null,
            row.status || null,
            existingContact.id
          ]);
          result.updated++;
          continue;
        }

        // Prepare new contact for batch insert
        toInsert.push({
          lead_id: row.lead_id || `LEAD-${Date.now()}-${row._row}`,
          first_name: row.first_name || null,
          last_name: row.last_name || null,
          email: row.email || null,
          primary_phone: row.phone_number || row.primary_phone || null,
          address: row.address || null,
          city: row.city || null,
          state: row.state || null,
          zip_code: row.zip || row.zip_code || null,
          status: row.status || 'NEW'
        });
      } catch (error: any) {
        result.failed++;
        if (result.errors.length < 10) {
          result.errors.push(`Row ${row._row}: ${error.message}`);
        }
      }
    }

    // Batch insert new contacts
    if (toInsert.length > 0) {
      try {
        const values = toInsert.map((contact, idx) => {
          const base = idx * 10;
          return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10})`;
        }).join(',');

        const params = toInsert.flatMap(contact => [
          contact.lead_id,
          contact.first_name,
          contact.last_name,
          contact.email,
          contact.primary_phone,
          contact.address,
          contact.city,
          contact.state,
          contact.zip_code,
          contact.status
        ]);

        const query = `
          INSERT INTO contacts (
            lead_id, first_name, last_name, email, primary_phone,
            address, city, state, zip_code, status
          ) VALUES ${values}
          ON CONFLICT (lead_id)
          DO UPDATE SET
            first_name = COALESCE(EXCLUDED.first_name, contacts.first_name),
            last_name = COALESCE(EXCLUDED.last_name, contacts.last_name),
            email = COALESCE(EXCLUDED.email, contacts.email),
            primary_phone = COALESCE(EXCLUDED.primary_phone, contacts.primary_phone),
            address = COALESCE(EXCLUDED.address, contacts.address),
            city = COALESCE(EXCLUDED.city, contacts.city),
            state = COALESCE(EXCLUDED.state, contacts.state),
            zip_code = COALESCE(EXCLUDED.zip_code, contacts.zip_code),
            status = COALESCE(EXCLUDED.status, contacts.status),
            updated_at = NOW()
        `;

        await db.none(query, params);
        result.created += toInsert.length;
      } catch (error: any) {
        console.error('Batch insert error for leads:', error);
        result.failed += toInsert.length;
        if (result.errors.length < 10) {
          result.errors.push(`Batch error: ${error.message}`);
        }
      }
    }
  }

  if (result.errors.length >= 10) {
    result.errors.push(`...and ${result.failed - 10} more errors`);
  }

  return result;
}

// Validate and process agents data
async function processAgents(rows: any[]): Promise<UploadResult> {
  const result: UploadResult = {
    success: true,
    processed: 0,
    failed: 0,
    errors: [],
    duplicates: 0,
    created: 0,
    updated: 0
  };

  const supabase = await createClient();

  for (const row of rows) {
    try {
      result.processed++;

      // Validate required fields
      if (!row.email) {
        result.failed++;
        result.errors.push(`Row ${row._row}: Missing email`);
        continue;
      }

      // Check if user exists in auth
      const { data: authUsers } = await supabase.auth.admin.listUsers();
      const authUser = authUsers.users.find(user => user.email === row.email);

      let userId: string;

      if (!authUser) {
        // Create auth user
        const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
          email: row.email,
          email_confirm: true,
          user_metadata: {
            name: row.name,
            phone: row.phone
          }
        });

        if (createError || !newUser?.user) {
          result.failed++;
          result.errors.push(`Row ${row._row}: Failed to create auth user: ${createError?.message}`);
          continue;
        }

        userId = newUser.user.id;
      } else {
        userId = authUser.id;
      }

      // Check for existing profile
      const existingProfile = await db.oneOrNone(
        'SELECT id FROM profiles WHERE id = $1',
        [userId]
      );

      if (existingProfile) {
        // Update profile
        await db.none(`
          UPDATE profiles SET
            name = COALESCE($1, name),
            phone = COALESCE($2, phone),
            updated_at = NOW()
          WHERE id = $3
        `, [row.name, row.phone, userId]);
        result.updated++;
      } else {
        // Create profile
        await db.none(`
          INSERT INTO profiles (id, email, name, phone, role, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
        `, [userId, row.email, row.name, row.phone, row.role || 'agent']);
        result.created++;
      }

      // Also ensure agent record exists
      const existingAgent = await db.oneOrNone(
        'SELECT id FROM agents WHERE ext_ref = $1',
        [row.email]
      );

      if (!existingAgent) {
        await db.none(`
          INSERT INTO agents (ext_ref, name, team, active)
          VALUES ($1, $2, $3, true)
        `, [row.email, row.name, row.team || 'default']);
      }

    } catch (error: any) {
      result.failed++;
      result.errors.push(`Row ${row._row}: ${error.message}`);
      if (result.errors.length > 10) {
        result.errors.push('...and more errors');
        break;
      }
    }
  }

  return result;
}

export async function POST(req: NextRequest) {
  // Check admin authentication
  const isAdmin = await isAdminAuthenticated(req);
  if (!isAdmin) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const type = formData.get('type') as string;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    if (!['calls', 'leads', 'agents'].includes(type)) {
      return NextResponse.json(
        { error: 'Invalid upload type' },
        { status: 400 }
      );
    }

    // Read file content
    const content = await file.text();

    // Parse CSV (Excel files would need additional library)
    const { headers, rows } = parseCSV(content);

    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'No data found in file' },
        { status: 400 }
      );
    }

    console.log(`[BULK UPLOAD] Processing ${rows.length} ${type} records`);

    // Process based on type
    let result: UploadResult;
    switch (type) {
      case 'calls':
        result = await processCalls(rows);
        break;
      case 'leads':
        result = await processLeads(rows);
        break;
      case 'agents':
        result = await processAgents(rows);
        break;
      default:
        return NextResponse.json(
          { error: 'Invalid upload type' },
          { status: 400 }
        );
    }

    console.log(`[BULK UPLOAD] Complete:`, {
      type,
      processed: result.processed,
      created: result.created,
      updated: result.updated,
      failed: result.failed
    });

    // If this was a calls upload, queue recordings fetch for calls with lead_id
    if (type === 'calls' && result.created > 0) {
      try {
        // Queue recording fetch for newly created calls that have lead_id
        const queueResult = await db.manyOrNone(`
          INSERT INTO pending_recordings (
            call_id, lead_id, attempts, created_at, scheduled_for, retry_phase, last_error
          )
          SELECT
            c.call_id,
            c.lead_id,
            0,
            NOW(),
            NOW(), -- Schedule immediately
            'quick',
            'bulk_upload_auto_queue'
          FROM calls c
          WHERE c.source = 'bulk_upload'
            AND c.lead_id IS NOT NULL
            AND c.recording_url IS NULL
            AND c.created_at > NOW() - INTERVAL '1 minute'
          ON CONFLICT DO NOTHING
          RETURNING id
        `);

        if (queueResult.length > 0) {
          console.log(`[BULK UPLOAD] Auto-queued ${queueResult.length} calls for recording fetch`);
        }
      } catch (queueError: any) {
        console.error('[BULK UPLOAD] Failed to auto-queue recordings:', queueError);
        // Don't fail the upload, just log the error
      }
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[BULK UPLOAD] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Upload failed' },
      { status: 500 }
    );
  }
}