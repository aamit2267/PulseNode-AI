import { and, eq, sql } from "drizzle-orm";
import type { Db } from "../../db/postgres/client.js";
import { companyMaintainers, companies } from "../../db/postgres/schema.js";

export type CompanyMaintainer = typeof companyMaintainers.$inferSelect;
export type NewCompanyMaintainer = Omit<
  typeof companyMaintainers.$inferInsert,
  "id" | "createdAt" | "updatedAt"
>;

export class CompanyMaintainersRepository {
  constructor(private readonly db: Db) {}

  async create(data: NewCompanyMaintainer): Promise<CompanyMaintainer> {
    const [row] = await this.db
      .insert(companyMaintainers)
      .values({
        ...data,
        email: data.email.toLowerCase(),
      })
      .returning();
    return row!;
  }

  async findById(id: string): Promise<CompanyMaintainer | undefined> {
    const [row] = await this.db
      .select()
      .from(companyMaintainers)
      .where(eq(companyMaintainers.id, id));
    return row;
  }

  async findByCompanyAndEmail(
    companyId: string,
    email: string,
  ): Promise<CompanyMaintainer | undefined> {
    const [row] = await this.db
      .select()
      .from(companyMaintainers)
      .where(
        and(
          eq(companyMaintainers.companyId, companyId),
          eq(companyMaintainers.email, email.toLowerCase()),
        ),
      );
    return row;
  }

  async listByCompany(companyId: string): Promise<CompanyMaintainer[]> {
    return this.db
      .select()
      .from(companyMaintainers)
      .where(eq(companyMaintainers.companyId, companyId));
  }

  async updateRole(
    id: string,
    role: CompanyMaintainer["role"],
  ): Promise<CompanyMaintainer | undefined> {
    const [row] = await this.db
      .update(companyMaintainers)
      .set({ role, updatedAt: new Date() })
      .where(eq(companyMaintainers.id, id))
      .returning();
    return row;
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(companyMaintainers).where(eq(companyMaintainers.id, id));
  }

  async countAdmins(companyId: string): Promise<number> {
    const rows = await this.db
      .select({ count: sql`count(*)` })
      .from(companyMaintainers)
      .where(
        and(
          eq(companyMaintainers.companyId, companyId),
          eq(companyMaintainers.role, "admin"),
        ),
      );
    return Number(rows[0]?.count ?? 0);
  }
}