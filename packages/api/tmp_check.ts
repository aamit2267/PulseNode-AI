import { testDb } from './tests/helpers/test-db.js';
import { sql } from 'drizzle-orm';

async function check() {
  try {
    // Check if table exists and its columns
    const result = await testDb.execute(sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'doctors'
      ORDER BY ordinal_position
    `);
    console.log('Doctors table columns:', result);
  } catch (e) {
    console.error('Error:', e);
  }
}
check();
