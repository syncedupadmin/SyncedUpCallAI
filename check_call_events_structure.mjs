import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { db } from './src/server/db.ts';

async function checkCallEventsStructure() {
  try {
    console.log('Checking call_events table structure...\n');

    // Get all columns
    const columns = await db.manyOrNone(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'call_events'
      ORDER BY ordinal_position
    `);

    console.log('call_events columns:');
    columns.forEach(col => {
      console.log(`  - ${col.column_name} (${col.data_type}) ${col.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'}`);
    });

    // Check for event-related column
    const hasEventColumn = columns.some(col =>
      col.column_name.includes('event') ||
      col.column_name.includes('type') ||
      col.column_name.includes('action')
    );

    if (!hasEventColumn) {
      console.log('\n⚠️ No event type column found');
      console.log('The table might use a different column name for event types');
    }

    // Get sample data
    const sample = await db.oneOrNone(`
      SELECT * FROM call_events
      ORDER BY created_at DESC
      LIMIT 1
    `);

    if (sample) {
      console.log('\nSample call_event record:');
      console.log(JSON.stringify(sample, null, 2));
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkCallEventsStructure();