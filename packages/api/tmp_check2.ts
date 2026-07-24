import { testDb } from './tests/helpers/test-db.js';
import { sql } from 'drizzle-orm';

async function check() {
  try {
    // Check if specialty column exists
    const result = await testDb.execute(sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'doctors' AND column_name = 'specialty'
    `);
    console.log('Specialty column:', result);
    
    // Check migrations table
    const migrations = await testDb.execute(sql`
      SELECT * FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 5
    `);
    console.log('Migrations:', migrations);
  } catch (e) {
    console.error('Error:', e);
  }
}
check();
