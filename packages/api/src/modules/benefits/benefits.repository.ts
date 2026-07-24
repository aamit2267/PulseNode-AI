import { and, eq, gte, lte, sql, desc, asc } from "drizzle-orm";
import type { Db } from "../../db/postgres/client.js";
import {
  walletCategories,
  walletExpirySnapshots,
  walletTransactions,
  wallets,
} from "../../db/postgres/schema.js";

export type Wallet = typeof wallets.$inferSelect;
export type NewWallet = Omit<typeof wallets.$inferInsert, "id" | "createdAt" | "updatedAt">;
export type WalletUpdate = Partial<Omit<typeof wallets.$inferInsert, "id" | "createdAt" | "updatedAt">>;

export type WalletCategory = typeof walletCategories.$inferSelect;
export type NewWalletCategory = Omit<typeof walletCategories.$inferInsert, "id" | "createdAt" | "updatedAt">;

export type WalletTransaction = typeof walletTransactions.$inferSelect;
export type NewWalletTransaction = Omit<typeof walletTransactions.$inferInsert, "id" | "createdAt">;

export type WalletExpirySnapshot = typeof walletExpirySnapshots.$inferSelect;
export type NewWalletExpirySnapshot = Omit<typeof walletExpirySnapshots.$inferInsert, "id" | "createdAt">;

export type WalletBalance = {
  category: "consultation" | "medicine" | "lab_test";
  annualLimit: number;
  spent: number;
  available: number;
};

export class BenefitsRepository {
  constructor(private readonly db: Db) {}

  // ==================== WALLETS ====================

  async createWallet(data: NewWallet): Promise<Wallet> {
    const [row] = await this.db
      .insert(wallets)
      .values(data)
      .returning();
    return row!;
  }

  async findWalletById(id: string): Promise<Wallet | undefined> {
    const [row] = await this.db
      .select()
      .from(wallets)
      .where(eq(wallets.id, id));
    return row;
  }

  async findWalletByEmployeeAndYear(
    employeeId: string,
    policyYearStart: Date,
  ): Promise<Wallet | undefined> {
    const [row] = await this.db
      .select()
      .from(wallets)
      .where(
        and(
          eq(wallets.employeeId, employeeId),
          eq(wallets.policyYearStart, policyYearStart),
        ),
      );
    return row;
  }

  async findWalletsByEmployee(employeeId: string): Promise<Wallet[]> {
    return this.db
      .select()
      .from(wallets)
      .where(eq(wallets.employeeId, employeeId))
      .orderBy(desc(wallets.policyYearStart));
  }

  async getActiveWallet(employeeId: string): Promise<Wallet | undefined> {
    const now = new Date();
    const [row] = await this.db
      .select()
      .from(wallets)
      .where(
        and(
          eq(wallets.employeeId, employeeId),
          eq(wallets.status, "active"),
          lte(wallets.policyYearStart, now),
          gte(wallets.policyYearEnd, now),
        ),
      )
      .orderBy(desc(wallets.policyYearStart))
      .limit(1);
    return row;
  }

  async updateWalletStatus(
    id: string,
    status: Wallet["status"],
  ): Promise<Wallet | undefined> {
    const [row] = await this.db
      .update(wallets)
      .set({ status, updatedAt: new Date() })
      .where(eq(wallets.id, id))
      .returning();
    return row;
  }

  async findWalletsByPolicyYearEnd(policyYearEnd: Date): Promise<Wallet[]> {
    return this.db
      .select()
      .from(wallets)
      .where(eq(wallets.policyYearEnd, policyYearEnd));
  }

  // ==================== WALLET CATEGORIES ====================

  async createWalletCategories(data: Array<NewWalletCategory>): Promise<WalletCategory[]> {
    const rows = await this.db
      .insert(walletCategories)
      .values(data)
      .returning();
    return rows;
  }

  async getWalletCategories(walletId: string): Promise<WalletCategory[]> {
    return this.db
      .select()
      .from(walletCategories)
      .where(eq(walletCategories.walletId, walletId));
  }

  async getWalletCategory(
    walletId: string,
    category: "consultation" | "medicine" | "lab_test",
  ): Promise<WalletCategory | undefined> {
    const [row] = await this.db
      .select()
      .from(walletCategories)
      .where(
        and(
          eq(walletCategories.walletId, walletId),
          eq(walletCategories.category, category),
        ),
      );
    return row;
  }

  async updateCategorySpent(
    walletId: string,
    category: "consultation" | "medicine" | "lab_test",
    spentDelta: number,
  ): Promise<WalletCategory | undefined> {
    const [row] = await this.db
      .update(walletCategories)
      .set({
        spentAmount: sql`${walletCategories.spentAmount} + ${spentDelta}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(walletCategories.walletId, walletId),
          eq(walletCategories.category, category),
        ),
      )
      .returning();
    return row;
  }

  // ==================== WALLET TRANSACTIONS (LEDGER) ====================

  async createTransaction(data: NewWalletTransaction): Promise<WalletTransaction> {
    const [row] = await this.db
      .insert(walletTransactions)
      .values(data)
      .returning();
    return row!;
  }

  async getTransactionById(id: string): Promise<WalletTransaction | undefined> {
    const [row] = await this.db
      .select()
      .from(walletTransactions)
      .where(eq(walletTransactions.id, id));
    return row;
  }

  async getTransactionByIdempotencyKey(
    key: string,
  ): Promise<WalletTransaction | undefined> {
    const [row] = await this.db
      .select()
      .from(walletTransactions)
      .where(eq(walletTransactions.idempotencyKey, key));
    return row;
  }

  async getTransactionsByWallet(
    walletId: string,
    filters?: {
      category?: "consultation" | "medicine" | "lab_test";
      limit?: number;
      offset?: number;
    },
  ): Promise<WalletTransaction[]> {
    const conditions = [eq(walletTransactions.walletId, walletId)];
    if (filters?.category) {
      conditions.push(eq(walletTransactions.category, filters.category));
    }

    return this.db
      .select()
      .from(walletTransactions)
      .where(and(...conditions))
      .orderBy(desc(walletTransactions.createdAt))
      .limit(filters?.limit ?? 50)
      .offset(filters?.offset ?? 0);
  }

  async getTransactionsBySource(
    sourceType: string,
    sourceId: string,
  ): Promise<WalletTransaction[]> {
    return this.db
      .select()
      .from(walletTransactions)
      .where(
        and(
          eq(walletTransactions.sourceType, sourceType),
          eq(walletTransactions.sourceId, sourceId),
        ),
      );
  }

  async getCategoryBalance(
    walletId: string,
    category: "consultation" | "medicine" | "lab_test",
  ): Promise<number> {
    const now = new Date();
    const [result] = await this.db
      .select({ balance: sql<number>`coalesce(sum(${walletTransactions.amount}), 0)` })
      .from(walletTransactions)
      .where(
        and(
          eq(walletTransactions.walletId, walletId),
          eq(walletTransactions.category, category),
          lte(walletTransactions.createdAt, now),
        ),
      );
    return result?.balance ?? 0;
  }

  // ==================== WALLET EXPIRY SNAPSHOTS ====================

  async createExpirySnapshot(
    data: NewWalletExpirySnapshot,
  ): Promise<WalletExpirySnapshot> {
    const [row] = await this.db
      .insert(walletExpirySnapshots)
      .values(data)
      .returning();
    return row!;
  }

  async getExpirySnapshotsByEmployee(employeeId: string): Promise<WalletExpirySnapshot[]> {
    return this.db
      .select()
      .from(walletExpirySnapshots)
      .where(eq(walletExpirySnapshots.employeeId, employeeId))
      .orderBy(desc(walletExpirySnapshots.policyYearEnd));
  }

  async getExpirySnapshotsByPolicyYear(policyYearEnd: Date): Promise<WalletExpirySnapshot[]> {
    return this.db
      .select()
      .from(walletExpirySnapshots)
      .where(eq(walletExpirySnapshots.policyYearEnd, policyYearEnd));
  }
}