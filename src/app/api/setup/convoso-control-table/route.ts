import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/server/db';

export async function GET(req: NextRequest) {
  try {
    // Create convoso_control_settings table if it doesn't exist
    await db.none(`
      CREATE TABLE IF NOT EXISTS convoso_control_settings (
        id INTEGER PRIMARY KEY DEFAULT 1,
        system_enabled BOOLEAN DEFAULT false,
        active_campaigns TEXT[] DEFAULT '{}',
        active_lists TEXT[] DEFAULT '{}',
        active_dispositions TEXT[] DEFAULT '{}',
        active_agents TEXT[] DEFAULT '{}',
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        CONSTRAINT single_row CHECK (id = 1)
      )
    `);

    // Create sync_state table if it doesn't exist
    await db.none(`
      CREATE TABLE IF NOT EXISTS sync_state (
        key VARCHAR(255) PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Insert default settings if not exists
    await db.none(`
      INSERT INTO convoso_control_settings (
        id, system_enabled, active_campaigns, active_lists,
        active_dispositions, active_agents, updated_at
      )
      VALUES (1, false, '{}', '{}', '{}', '{}', NOW())
      ON CONFLICT (id) DO NOTHING
    `);

    return NextResponse.json({
      ok: true,
      message: 'Convoso control tables created successfully'
    });

  } catch (error: any) {
    console.error('Error creating convoso control tables:', error);
    return NextResponse.json({
      ok: false,
      error: error.message
    }, { status: 500 });
  }
}