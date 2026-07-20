import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import pg from "pg";
import * as schema from "../../src/db/postgres/schema.js";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://pulsenode:pulsenode_dev@localhost:5432/pulsenode_test";

export const testPool = new pg.Pool({ connectionString: TEST_DATABASE_URL });
export const testDb = drizzle(testPool, { schema });

export async function truncateAll() {
  await testDb.execute(
    sql`TRUNCATE TABLE dependents, employees, ingestion_batches, policies, companies RESTART IDENTITY CASCADE`,
  );
}

export async function closeTestDb() {
  await testPool.end();
}
