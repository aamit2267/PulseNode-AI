import { eq } from "drizzle-orm";
import type { Db } from "../../db/postgres/client.js";
import { ingestionBatches } from "../../db/postgres/schema.js";

export type IngestionBatch = typeof ingestionBatches.$inferSelect;
export type NewIngestionBatch = Omit<
  typeof ingestionBatches.$inferInsert,
  "id" | "createdAt"
>;

export class IngestionRepository {
  constructor(private readonly db: Db) {}

  async create(data: NewIngestionBatch): Promise<IngestionBatch> {
    const [row] = await this.db
      .insert(ingestionBatches)
      .values(data)
      .returning();
    return row!;
  }

  async findById(id: string): Promise<IngestionBatch | undefined> {
    const [row] = await this.db
      .select()
      .from(ingestionBatches)
      .where(eq(ingestionBatches.id, id));
    return row;
  }

  async listByCompany(companyId: string): Promise<IngestionBatch[]> {
    return this.db
      .select()
      .from(ingestionBatches)
      .where(eq(ingestionBatches.companyId, companyId));
  }
}
