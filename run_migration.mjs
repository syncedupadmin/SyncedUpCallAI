import { db } from './src/server/db.ts';
import fs from 'fs';

async function runMigration() {
  try {
    console.log('Starting database migration...\n');

    // Read the SQL file
    const sql = fs.readFileSync('./migrations/fix_embeddings_schema.sql', 'utf8');

    // Split by statements (simple split, works for this case)
    const statements = sql.split(/;\s*$/m).filter(s => s.trim());

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i].trim();
      if (!stmt) continue;

      console.log(`Executing statement ${i + 1}/${statements.length}...`);

      try {
        const result = await db.query(stmt + ';');

        // If it's a SELECT statement, show results
        if (stmt.toLowerCase().includes('select') && result.length > 0) {
          console.log('Results:', JSON.stringify(result[0], null, 2));
        } else {
          console.log('✓ Success');
        }
      } catch (err) {
        console.error(`✗ Error in statement ${i + 1}:`, err.message);
        // Continue with other statements
      }

      console.log('');
    }

    console.log('Migration complete!');
    process.exit(0);
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  }
}

runMigration();