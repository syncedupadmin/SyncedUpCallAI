import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { db } from './src/server/db.ts';

async function checkStructure() {
  try {
    // Check embeddings_meta constraints
    const constraints = await db.manyOrNone(`
      SELECT conname, contype
      FROM pg_constraint
      WHERE conrelid = 'embeddings_meta'::regclass
    `);

    console.log('embeddings_meta constraints:', constraints);

    // Check columns
    const columns = await db.manyOrNone(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'embeddings_meta'
      ORDER BY ordinal_position
    `);

    console.log('\nembeddings_meta columns:', columns);

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkStructure();