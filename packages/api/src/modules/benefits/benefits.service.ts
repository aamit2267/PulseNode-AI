import { logger } from "../../lib/logger.js";
import type { BenefitsRepository } from "./benefits.repository.js";
import type { Wallet, WalletCategory, WalletTransaction, WalletExpirySnapshot, WalletBalance } from "./benefits.repository.js";

export interface WalletBalanceResponse {
  walletId: string;
  employeeId: string;
  policyYearStart: Date;
  policyYearEnd: Date;
  categories: WalletBalance[];
  totalAnnualLimit: number;
  totalSpent: number;
  totalAvailable: number;
}

export interface DebitWalletInput {
  walletId: string;
  category: "consultation" | "medicine" | "lab_test";
  amount: number;
  sourceType: string;
  sourceId: string;
  description?: string;
  createdBy: string;
  idempotencyKey?: string;
}

export interface CreditWalletInput {
  walletId: string;
  category: "consultation" | "medicine" | "lab_test";
  amount: number;
  sourceType: string;
  sourceId: string;
  description?: string;
  createdBy: string;
  idempotencyKey?: string;
}

export interface RefundWalletInput extends CreditWalletInput {
  originalTransactionId: string;
}

export interface CreateWalletInput {
  employeeId: string;
  policyId: string;
  policyYearStart: Date;
  policyYearEnd: Date;
  consultationLimit: number;
  medicineLimit: number;
  labTestLimit: number;
}

export interface PolicyYearEndSnapshotResult {
  walletId: string;
  employeeId: string;
  snapshotsCreated: number;
  totalUnclaimed: number;
}

export class BenefitsService {
  constructor(private readonly repo: BenefitsRepository) {}

  // ==================== WALLET CREATION ====================

  async createWalletForEmployee(input: CreateWalletInput): Promise<Wallet> {
    // Check if wallet already exists for this policy year
    const existing = await this.repo.findWalletByEmployeeAndYear(input.employeeId, input.policyYearStart);
    if (existing) {
      throw new Error("Wallet already exists for this employee and policy year");
    }

    // Create wallet
    const wallet = await this.repo.createWallet({
      employeeId: input.employeeId,
      policyId: input.policyId,
      policyYearStart: input.policyYearStart,
      policyYearEnd: input.policyYearEnd,
      status: "active",
    });

    // Create 3 wallet categories with limits snapshotted from policy
    const categories = [
      {
        walletId: wallet.id,
        category: "consultation" as const,
        annualLimit: input.consultationLimit,
        spentAmount: 0,
      },
      {
        walletId: wallet.id,
        category: "medicine" as const,
        annualLimit: input.medicineLimit,
        spentAmount: 0,
      },
      {
        walletId: wallet.id,
        category: "lab_test" as const,
        annualLimit: input.labTestLimit,
        spentAmount: 0,
      },
    ];

    await this.repo.createWalletCategories(categories);

    logger.info({ walletId: wallet.id, employeeId: input.employeeId, policyYearStart: input.policyYearStart }, "Wallet created for employee");
    return wallet;
  }

  async getOrCreateWallet(
    employeeId: string,
    policyId: string,
    policyYearStart: Date,
    policyYearEnd: Date,
    consultationLimit: number,
    medicineLimit: number,
    labTestLimit: number,
  ): Promise<Wallet> {
    const existing = await this.repo.findWalletByEmployeeAndYear(employeeId, policyYearStart);
    if (existing) {
      return existing;
    }
    return this.createWalletForEmployee({
      employeeId,
      policyId,
      policyYearStart,
      policyYearEnd,
      consultationLimit,
      medicineLimit,
      labTestLimit,
    });
  }

  // ==================== WALLET BALANCE ====================

  async getWalletBalance(employeeId: string): Promise<WalletBalanceResponse> {
    const wallet = await this.repo.getActiveWallet(employeeId);
    if (!wallet) {
      throw new Error("No active wallet found for employee");
    }

    const categories = await this.repo.getWalletCategories(wallet.id);
    const categoryBalances: WalletBalance[] = [];
    let totalAnnualLimit = 0;
    let totalSpent = 0;

    for (const cat of categories) {
      const ledgerBalance = await this.repo.getCategoryBalance(wallet.id, cat.category);
      // ledgerBalance is sum of amounts: negative for debits (spent), positive for credits
      // spent amount is the absolute value of negative balance
      const spent = Math.max(0, -ledgerBalance);
      const available = cat.annualLimit - spent;

      categoryBalances.push({
        category: cat.category,
        annualLimit: cat.annualLimit,
        spent,
        available: Math.max(0, available),
      });

      totalAnnualLimit += cat.annualLimit;
      totalSpent += spent;
    }

    return {
      walletId: wallet.id,
      employeeId: wallet.employeeId,
      policyYearStart: wallet.policyYearStart,
      policyYearEnd: wallet.policyYearEnd,
      categories: categoryBalances,
      totalAnnualLimit,
      totalSpent,
      totalAvailable: totalAnnualLimit - totalSpent,
    };
  }

  async getWalletTransactions(
    walletId: string,
    filters?: {
      category?: "consultation" | "medicine" | "lab_test";
      limit?: number;
      offset?: number;
      type?: string;
      fromDate?: string;
      toDate?: string;
    },
  ): Promise<WalletTransaction[]> {
    const pagination = {
      limit: filters?.limit ?? 50,
      offset: filters?.offset ?? 0,
      ...(filters?.category && { category: filters.category }),
    };
    return this.repo.getTransactionsByWallet(walletId, pagination);
  }

  // ==================== DEBIT (SPEND) ====================

  async debitWallet(input: DebitWalletInput): Promise<WalletTransaction> {
    const wallet = await this.repo.findWalletById(input.walletId);
    if (!wallet) {
      throw new Error("Wallet not found");
    }
    if (wallet.status !== "active") {
      throw new Error(`Wallet is ${wallet.status}, cannot debit`);
    }

    const category = await this.repo.getWalletCategory(input.walletId, input.category);
    if (!category) {
      throw new Error(`Category ${input.category} not found in wallet`);
    }

    // Check idempotency
    if (input.idempotencyKey) {
      const existing = await this.repo.getTransactionByIdempotencyKey(input.idempotencyKey);
      if (existing) {
        logger.info({ idempotencyKey: input.idempotencyKey }, "Idempotent debit request - returning existing transaction");
        return existing;
      }
    }

    // Get current balance from LEDGER (source of truth)
    const currentBalance = await this.repo.getCategoryBalance(input.walletId, input.category);
    // currentBalance is negative for spent amount (e.g., -10000 means 10000 spent)
    const spent = -Math.min(0, currentBalance);
    const newSpent = spent + input.amount;

    // Validation: cannot exceed annual limit
    if (newSpent > category.annualLimit) {
      const available = category.annualLimit - spent;
      throw new Error(`Cannot exceed annual limit for ${input.category}. Limit: ${category.annualLimit}, Already spent: ${spent}, Requested: ${input.amount}, Available: ${available}`);
    }

    const newBalance = currentBalance - input.amount; // more negative

    const transaction = await this.repo.createTransaction({
      walletId: input.walletId,
      category: input.category,
      type: "debit",
      amount: -input.amount, // negative for debit
      balanceAfter: newBalance,
      categoryLimitAtTxn: category.annualLimit,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      description: input.description,
      createdBy: input.createdBy,
      idempotencyKey: input.idempotencyKey,
    });

    // Update spent amount cache
    await this.repo.updateCategorySpent(input.walletId, input.category, input.amount);

    // Check if all categories are exhausted and update wallet status
    await this.checkAndUpdateWalletStatus(input.walletId);

    logger.info({
      walletId: input.walletId,
      category: input.category,
      amount: input.amount,
      newBalance,
      sourceType: input.sourceType,
      sourceId: input.sourceId
    }, "Wallet debited");

    return transaction;
  }

  // ==================== CREDIT (TOP-UP) ====================

  async creditWallet(input: CreditWalletInput): Promise<WalletTransaction> {
    const wallet = await this.repo.findWalletById(input.walletId);
    if (!wallet) {
      throw new Error("Wallet not found");
    }
    if (wallet.status !== "active") {
      throw new Error(`Wallet is ${wallet.status}, cannot credit`);
    }

    const category = await this.repo.getWalletCategory(input.walletId, input.category);
    if (!category) {
      throw new Error(`Category ${input.category} not found in wallet`);
    }

    // Check idempotency
    if (input.idempotencyKey) {
      const existing = await this.repo.getTransactionByIdempotencyKey(input.idempotencyKey);
      if (existing) {
        logger.info({ idempotencyKey: input.idempotencyKey }, "Idempotent credit request - returning existing transaction");
        return existing;
      }
    }

    // Get current balance from LEDGER
    const currentBalance = await this.repo.getCategoryBalance(input.walletId, input.category);

    // currentBalance is negative for spent amount (e.g., -10000 means 10000 spent)
    // spent = positive amount spent so far
    const spent = -Math.min(0, currentBalance);

    // Validation depends on source type:
    // - For REFUNDS: can only credit up to what was spent (can't refund more than spent)
    // - For TOPUPS: can credit up to annual limit (spent + credit <= annualLimit)
    if (input.sourceType === "refund") {
      if (input.amount > spent) {
        throw new Error(`Refund amount ${input.amount} exceeds spent amount ${spent}`);
      }
    } else if (input.sourceType === "topup") {
      // Top-up can add funds up to annual limit
      if (spent + input.amount > category.annualLimit) {
        const available = category.annualLimit - spent;
        throw new Error(`Top-up would exceed annual limit. Limit: ${category.annualLimit}, Already spent: ${spent}, Available: ${available}, Requested: ${input.amount}`);
      }
    } else {
      // For other credit types (adjustment, etc.), allow up to annual limit
      if (spent + input.amount > category.annualLimit) {
        const available = category.annualLimit - spent;
        throw new Error(`Credit would exceed annual limit. Limit: ${category.annualLimit}, Already spent: ${spent}, Available: ${available}, Requested: ${input.amount}`);
      }
    }

    const newBalance = currentBalance + input.amount;

    const transaction = await this.repo.createTransaction({
      walletId: input.walletId,
      category: input.category,
      type: "credit",
      amount: input.amount, // positive for credit
      balanceAfter: newBalance,
      categoryLimitAtTxn: category.annualLimit,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      description: input.description,
      createdBy: input.createdBy,
      idempotencyKey: input.idempotencyKey,
    });

    // Update spent amount cache (decrease since we're crediting back)
    await this.repo.updateCategorySpent(input.walletId, input.category, -input.amount);

    logger.info({
      walletId: input.walletId,
      category: input.category,
      amount: input.amount,
      newBalance,
      sourceType: input.sourceType
    }, "Wallet credited");

    return transaction;
  }

  // ==================== REFUND ====================

  async refundWallet(input: RefundWalletInput): Promise<WalletTransaction> {
    // Verify original transaction exists and is a debit
    const originalTxn = await this.repo.getTransactionById(input.originalTransactionId);
    if (!originalTxn) {
      throw new Error("Original transaction not found");
    }
    if (originalTxn.type !== "debit") {
      throw new Error("Can only refund debit transactions");
    }
    if (originalTxn.category !== input.category) {
      throw new Error("Category mismatch with original transaction");
    }
    if (originalTxn.walletId !== input.walletId) {
      throw new Error("Wallet mismatch with original transaction");
    }

    // Check refund amount doesn't exceed original
    const originalAmount = -originalTxn.amount; // positive value
    if (input.amount > originalAmount) {
      throw new Error(`Refund amount ${input.amount} exceeds original debit ${originalAmount}`);
    }

    // Check if already refunded (partially or fully)
    const existingRefunds = await this.repo.getTransactionsBySource("refund", input.originalTransactionId);
    const totalRefunded = existingRefunds.reduce((sum, r) => sum + r.amount, 0);
    if (totalRefunded + input.amount > originalAmount) {
      throw new Error(`Total refunds would exceed original amount. Already refunded: ${totalRefunded}`);
    }

    // Process as credit with type 'refund'
    return this.creditWallet({
      ...input,
      sourceType: "refund",
      sourceId: input.originalTransactionId,
      description: input.description || `Refund for ${input.originalTransactionId}`,
    });
  }

  // ==================== POLICY YEAR-END SNAPSHOT ====================

  async runPolicyYearEndSnapshot(policyYearEnd: Date): Promise<PolicyYearEndSnapshotResult[]> {
    const wallets = await this.repo.findWalletsByPolicyYearEnd(policyYearEnd);
    const results: PolicyYearEndSnapshotResult[] = [];

    for (const wallet of wallets) {
      const categories = await this.repo.getWalletCategories(wallet.id);
      let totalUnclaimed = 0;
      let snapshotsCreated = 0;

      for (const cat of categories) {
        const spent = await this.repo.getCategoryBalance(wallet.id, cat.category);
        const spentAmount = -Math.min(0, spent); // positive value
        const unclaimed = cat.annualLimit - spentAmount;

        if (unclaimed > 0) {
          await this.repo.createExpirySnapshot({
            employeeId: wallet.employeeId,
            walletId: wallet.id,
            category: cat.category,
            annualLimit: cat.annualLimit,
            spentAmount: spentAmount,
            unclaimedAmount: unclaimed,
            policyYearEnd: policyYearEnd,
          });
          snapshotsCreated++;
          totalUnclaimed += unclaimed;
        }
      }

      // Mark wallet as expired
      await this.repo.updateWalletStatus(wallet.id, "expired");

      results.push({
        walletId: wallet.id,
        employeeId: wallet.employeeId,
        snapshotsCreated,
        totalUnclaimed,
      });

      logger.info({ walletId: wallet.id, snapshotsCreated, totalUnclaimed }, "Policy year-end snapshot completed");
    }

    return results;
  }

  // ==================== HELPER METHODS ====================

  async getWalletByEmployee(employeeId: string): Promise<Wallet | undefined> {
    return this.repo.getActiveWallet(employeeId);
  }

  async getWalletById(walletId: string): Promise<Wallet | undefined> {
    return this.repo.findWalletById(walletId);
  }

  // Helper to fetch a specific wallet category
  async getWalletCategory(walletId: string, category: "consultation" | "medicine" | "lab_test"): Promise<WalletCategory | undefined> {
    return this.repo.getWalletCategory(walletId, category);
  }

  // Helper to get spent amount for a category (from ledger, up to now)
  async getCategorySpent(walletId: string, category: "consultation" | "medicine" | "lab_test"): Promise<number> {
    const balance = await this.repo.getCategoryBalance(walletId, category);
    // balance is negative for spent, so return positive value
    return -Math.min(0, balance);
  }

  // Helper to count transactions for a wallet (used for pagination total)
  async getTransactionCount(walletId: string, filters?: any): Promise<number> {
    const transactions = await this.repo.getTransactionsByWallet(walletId, filters);
    return transactions.length;
  }

  // Find transaction by payment ID (used for idempotency check in webhook)
  async getTransactionByPaymentId(paymentId: string): Promise<WalletTransaction | undefined> {
    const txns = await this.repo.getTransactionsBySource('topup', paymentId);
    return txns.length > 0 ? txns[0] : undefined;
  }

  // Check if all categories in a wallet are exhausted and update wallet status
  private async checkAndUpdateWalletStatus(walletId: string): Promise<void> {
    const wallet = await this.repo.findWalletById(walletId);
    if (!wallet || wallet.status !== "active") {
      return;
    }

    const categories = await this.repo.getWalletCategories(walletId);
    let allExhausted = true;

    for (const cat of categories) {
      const currentBalance = await this.repo.getCategoryBalance(walletId, cat.category);
      const spent = -Math.min(0, currentBalance);
      if (spent < cat.annualLimit) {
        allExhausted = false;
        break;
      }
    }

    if (allExhausted) {
      await this.repo.updateWalletStatus(walletId, "exhausted");
      logger.info({ walletId }, "Wallet marked as exhausted - all categories fully utilized");
    }
  }
}