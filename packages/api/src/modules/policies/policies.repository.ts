import { and, eq, sql } from "drizzle-orm";
import type { Db } from "../../db/postgres/client.js";
import { policies } from "../../db/postgres/schema.js";

export type Policy = typeof policies.$inferSelect;
export type NewPolicy = Omit<
  typeof policies.$inferInsert,
  "id" | "version" | "isActive" | "effectiveTo" | "createdAt" | "updatedAt"
>;

// Fields an admin may change when editing (versioning) a policy. Identity
// fields (companyId, tierName) are fixed for the lineage.
export type PolicyEdit = Partial<
  Omit<NewPolicy, "companyId" | "tierName">
>;

export class PoliciesRepository {
  constructor(private readonly db: Db) {}

  async create(data: NewPolicy): Promise<Policy> {
    const [row] = await this.db.insert(policies).values(data).returning();
    return row!;
  }

  async findById(id: string): Promise<Policy | undefined> {
    const [row] = await this.db
      .select()
      .from(policies)
      .where(eq(policies.id, id));
    return row;
  }

  async findActiveByTierName(
    companyId: string,
    tierName: string,
  ): Promise<Policy | undefined> {
    const [row] = await this.db
      .select()
      .from(policies)
      .where(
        and(
          eq(policies.companyId, companyId),
          eq(policies.tierName, tierName),
          eq(policies.isActive, true),
        ),
      );
    return row;
  }

  /** Case-insensitive variant for ingestion, where tier names come from
   *  hand-edited spreadsheets. Exact-name lookups should use
   *  findActiveByTierName. */
  async findActiveByTierNameInsensitive(
    companyId: string,
    tierName: string,
  ): Promise<Policy | undefined> {
    const [row] = await this.db
      .select()
      .from(policies)
      .where(
        and(
          eq(policies.companyId, companyId),
          sql`lower(${policies.tierName}) = lower(${tierName})`,
          eq(policies.isActive, true),
        ),
      );
    return row;
  }

  async listByCompany(companyId: string): Promise<Policy[]> {
    return this.db
      .select()
      .from(policies)
      .where(eq(policies.companyId, companyId));
  }

  /**
   * "Edit" a policy: insert a new row carrying forward unchanged fields,
   * retire the old row (is_active = false, effective_to = today). The old
   * row's business fields are never touched, so employees enrolled under
   * it keep an accurate historical reference.
   */
  async createNewVersion(policyId: string, changes: PolicyEdit): Promise<Policy> {
    return this.db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(policies)
        .where(eq(policies.id, policyId))
        .for("update");

      if (!current) throw new Error(`Policy ${policyId} not found`);
      if (!current.isActive) {
        throw new Error(
          `Policy ${policyId} is inactive; edit the active version of tier "${current.tierName}" instead`,
        );
      }

      const today = new Date().toISOString().slice(0, 10);

      await tx
        .update(policies)
        .set({ isActive: false, effectiveTo: today, updatedAt: new Date() })
        .where(eq(policies.id, current.id));

      const [next] = await tx
        .insert(policies)
        .values({
          companyId: current.companyId,
          tierName: current.tierName,
          sumInsured: changes.sumInsured ?? current.sumInsured,
          policyKind: changes.policyKind ?? current.policyKind,
          coverageBasis: changes.coverageBasis ?? current.coverageBasis,
          roomRentLimit:
            changes.roomRentLimit !== undefined
              ? changes.roomRentLimit
              : current.roomRentLimit,
          coPayPercent:
            changes.coPayPercent !== undefined
              ? changes.coPayPercent
              : current.coPayPercent,
          waitingPeriodDays:
            changes.waitingPeriodDays !== undefined
              ? changes.waitingPeriodDays
              : current.waitingPeriodDays,
          walletLimitConsultation:
            changes.walletLimitConsultation ?? current.walletLimitConsultation,
          walletLimitMedicine:
            changes.walletLimitMedicine ?? current.walletLimitMedicine,
          walletLimitLabTest:
            changes.walletLimitLabTest ?? current.walletLimitLabTest,
          effectiveFrom: changes.effectiveFrom ?? today,
          version: current.version + 1,
          isActive: true,
        })
        .returning();

      return next!;
    });
  }
}
