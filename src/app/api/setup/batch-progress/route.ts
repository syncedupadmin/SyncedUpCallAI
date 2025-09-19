import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/server/db';

export async function GET(req: NextRequest) {
  try {
    // Create batch_progress table
    await db.none(`
      CREATE TABLE IF NOT EXISTS batch_progress (
        batch_id VARCHAR(50) PRIMARY KEY,
        total INTEGER NOT NULL DEFAULT 0,
        scanned INTEGER NOT NULL DEFAULT 0,
        posted INTEGER NOT NULL DEFAULT 0,
        completed INTEGER NOT NULL DEFAULT 0,
        failed INTEGER NOT NULL DEFAULT 0,
        status VARCHAR(20) DEFAULT 'processing',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Create index
    await db.none(`
      CREATE INDEX IF NOT EXISTS idx_batch_progress_created_at ON batch_progress(created_at DESC)
    `);

    // Create trigger function
    await db.none(`
      CREATE OR REPLACE FUNCTION update_batch_progress_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);

    // Create trigger
    await db.none(`
      DROP TRIGGER IF EXISTS update_batch_progress_updated_at ON batch_progress
    `);

    await db.none(`
      CREATE TRIGGER update_batch_progress_updated_at
      BEFORE UPDATE ON batch_progress
      FOR EACH ROW
      EXECUTE FUNCTION update_batch_progress_updated_at()
    `);

    return NextResponse.json({
      ok: true,
      message: 'Batch progress table created successfully'
    });

  } catch (error: any) {
    console.error('Error creating batch_progress table:', error);
    return NextResponse.json({
      ok: false,
      error: error.message
    }, { status: 500 });
  }
}