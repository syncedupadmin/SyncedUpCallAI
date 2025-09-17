import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/server/db';
import { isAdminAuthenticated } from '@/src/server/auth/admin';
import { createClient } from '@/src/lib/supabase/server';

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

        // Validate required fields
        if (!row.phone_number && !row.call_id) {
          result.failed++;
          if (result.errors.length < 10) {
            result.errors.push(`Row ${row._row}: Missing phone_number or call_id`);
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
          `($${idx * 11 + 1}, $${idx * 11 + 2}, $${idx * 11 + 3}, $${idx * 11 + 4}, $${idx * 11 + 5}, $${idx * 11 + 6}, $${idx * 11 + 7}, $${idx * 11 + 8}, $${idx * 11 + 9}, $${idx * 11 + 10}, $${idx * 11 + 11})`
        ).join(',');

        const params = toInsert.flatMap(call => [
          'bulk_upload',
          call.call_id,
          call.source_ref,
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
            source, call_id, source_ref, phone_number, agent_name, disposition,
            duration_sec, started_at, ended_at, campaign, recording_url
          ) VALUES ${values}
          ON CONFLICT (call_id)
          DO UPDATE SET
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

// Validate and process leads data
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

  for (const row of rows) {
    try {
      result.processed++;

      // Validate required fields
      if (!row.email && !row.phone_number) {
        result.failed++;
        result.errors.push(`Row ${row._row}: Missing email or phone_number`);
        continue;
      }

      // Check for existing contact
      const existingContact = await db.oneOrNone(
        'SELECT id FROM contacts WHERE email = $1 OR primary_phone = $2',
        [row.email, row.phone_number]
      );

      if (existingContact) {
        result.duplicates++;
        continue;
      }

      // Create contact
      await db.none(`
        INSERT INTO contacts (
          lead_id, first_name, last_name, email, primary_phone,
          address, city, state, zip_code, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      `, [
        row.lead_id || `LEAD-${Date.now()}-${row._row}`,
        row.first_name,
        row.last_name,
        row.email,
        row.phone_number,
        row.address,
        row.city,
        row.state,
        row.zip,
        row.status || 'NEW'
      ]);
      result.created++;
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

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[BULK UPLOAD] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Upload failed' },
      { status: 500 }
    );
  }
}