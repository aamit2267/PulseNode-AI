import { testDb } from './tests/helpers/test-db.js';
import { sql } from 'drizzle-orm';

async function check() {
  try {
    const result = await testDb.execute(sql`SELECT * FROM __drizzle_migrations`);
    console.log('Migrations:', result);
  } catch (e: any) {
    console.error('Error:', e.message);
  }
}
check();
