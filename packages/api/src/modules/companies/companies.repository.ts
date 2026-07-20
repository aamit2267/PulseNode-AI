import { eq } from "drizzle-orm";
import type { Db } from "../../db/postgres/client.js";
import { companies } from "../../db/postgres/schema.js";

export type Company = typeof companies.$inferSelect;
export type NewCompany = Pick<
  typeof companies.$inferInsert,
  "name" | "corporateEmailDomain" | "mfaRequired"
>;

export class CompaniesRepository {
  constructor(private readonly db: Db) {}

  async create(data: NewCompany): Promise<Company> {
    const [row] = await this.db.insert(companies).values(data).returning();
    return row!;
  }

  async findById(id: string): Promise<Company | undefined> {
    const [row] = await this.db
      .select()
      .from(companies)
      .where(eq(companies.id, id));
    return row;
  }

  async update(
    id: string,
    data: Partial<NewCompany>,
  ): Promise<Company | undefined> {
    const [row] = await this.db
      .update(companies)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(companies.id, id))
      .returning();
    return row;
  }

  async list(): Promise<Company[]> {
    return this.db.select().from(companies);
  }
}
