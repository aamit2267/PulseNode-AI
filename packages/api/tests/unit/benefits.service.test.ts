import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { BenefitsService } from "../../src/modules/benefits/benefits.service.js";
import type { BenefitsRepository } from "../../src/modules/benefits/benefits.repository.js";
import type { Wallet, WalletCategory, WalletTransaction, WalletExpirySnapshot, WalletBalance } from "../../src/modules/benefits/benefits.repository.js";

const mockRepo: Partial<BenefitsRepository> = {
  findWalletByEmployeeAndYear: vi.fn(),
  createWallet: vi.fn(),
  createWalletCategories: vi.fn(),
  getActiveWallet: vi.fn(),
  findWalletById: vi.fn(),
  getWalletCategories: vi.fn(),
  getWalletCategory: vi.fn(),
  getCategoryBalance: vi.fn(),
  getTransactionByIdempotencyKey: vi.fn(),
  createTransaction: vi.fn(),
  updateCategorySpent: vi.fn(),
  getTransactionById: vi.fn(),
  getTransactionsBySource: vi.fn(),
  getTransactionsByWallet: vi.fn(),
  findWalletsByPolicyYearEnd: vi.fn(),
  getWalletCategories: vi.fn(),
  getCategoryBalance: vi.fn(),
  createExpirySnapshot: vi.fn(),
  updateWalletStatus: vi.fn(),
  getActiveWallet: vi.fn(),
  findWalletById: vi.fn(),
};

const service = new BenefitsService(mockRepo as BenefitsRepository);

function createWallet(overrides = {}): Wallet {
  return {
    id: "wallet-123",
    employeeId: "emp-123",
    policyId: "policy-123",
    policyYearStart: new Date("2024-01-01"),
    policyYearEnd: new Date("2024-12-31"),
    status: "active",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createWalletCategory(overrides = {}): WalletCategory {
  return {
    id: "cat-123",
    walletId: "wallet-123",
    category: "consultation",
    annualLimit: 50000,
    spentAmount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createWalletTransaction(overrides = {}): WalletTransaction {
  return {
    id: "txn-123",
    walletId: "wallet-123",
    category: "consultation",
    type: "debit",
    amount: -500,
    balanceAfter: -500,
    categoryLimitAtTxn: 50000,
    sourceType: "consultation",
    sourceId: "consultation-123",
    description: "Consultation fee",
    createdBy: "emp-123",
    idempotencyKey: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function createWalletExpirySnapshot(overrides = {}): WalletExpirySnapshot {
  return {
    id: "snapshot-123",
    employeeId: "emp-123",
    walletId: "wallet-123",
    category: "consultation",
    annualLimit: 50000,
    spentAmount: 10000,
    unclaimedAmount: 40000,
    policyYearEnd: new Date("2024-12-31"),
    createdAt: new Date(),
    ...overrides,
  };
}

function createWalletBalance(overrides = {}): WalletBalance {
  return {
    category: "consultation",
    annualLimit: 50000,
    spent: 10000,
    available: 40000,
    ...overrides,
  };
}

function createWalletInput(overrides = {}) {
  return {
    employeeId: "emp-123",
    policyId: "policy-123",
    policyYearStart: new Date("2024-01-01"),
    policyYearEnd: new Date("2024-12-31"),
    consultationLimit: 50000,
    medicineLimit: 30000,
    labTestLimit: 20000,
    ...overrides,
  };
}

function createDebitInput(overrides = {}) {
  return {
    walletId: "wallet-123",
    category: "consultation" as const,
    amount: 500,
    sourceType: "consultation",
    sourceId: "consultation-123",
    description: "Consultation fee",
    createdBy: "emp-123",
    idempotencyKey: "idem-123",
    ...overrides,
  };
}

function createCreditInput(overrides = {}) {
  return {
    walletId: "wallet-123",
    category: "consultation" as const,
    amount: 500,
    sourceType: "topup",
    sourceId: "topup-123",
    description: "Wallet top-up",
    createdBy: "emp-123",
    idempotencyKey: "idem-456",
    ...overrides,
  };
}

function createRefundInput(overrides = {}) {
  return {
    walletId: "wallet-123",
    category: "consultation" as const,
    amount: 500,
    sourceType: "refund",
    sourceId: "refund-123",
    description: "Refund for consultation",
    createdBy: "emp-123",
    originalTransactionId: "txn-123",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe("BenefitsService", () => {
  describe("createWalletForEmployee", () => {
    it("creates a wallet with three categories on success", async () => {
      const input = createWalletInput();
      const wallet = createWallet({ employeeId: input.employeeId, policyId: input.policyId });
      const categories = [
        { category: "consultation", annualLimit: input.consultationLimit },
        { category: "medicine", annualLimit: input.medicineLimit },
        { category: "lab_test", annualLimit: input.labTestLimit },
      ];

      mockRepo.findWalletByEmployeeAndYear.mockResolvedValue(undefined);
      mockRepo.createWallet.mockResolvedValue(wallet);
      mockRepo.createWalletCategories.mockResolvedValue(categories.map((c, i) => ({ ...c, id: `cat-${i}`, walletId: wallet.id, spentAmount: 0, createdAt: new Date(), updatedAt: new Date() })));

      const result = await service.createWalletForEmployee(input);

      expect(result).toEqual(wallet);
      expect(mockRepo.findWalletByEmployeeAndYear).toHaveBeenCalledWith(input.employeeId, input.policyYearStart);
      expect(mockRepo.createWallet).toHaveBeenCalledWith(expect.objectContaining({
        employeeId: input.employeeId,
        policyId: input.policyId,
        policyYearStart: input.policyYearStart,
        policyYearEnd: input.policyYearEnd,
        status: "active",
      }));
      expect(mockRepo.createWalletCategories).toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({ walletId: wallet.id, category: "consultation", annualLimit: input.consultationLimit, spentAmount: 0 }),
        expect.objectContaining({ walletId: wallet.id, category: "medicine", annualLimit: input.medicineLimit, spentAmount: 0 }),
        expect.objectContaining({ walletId: wallet.id, category: "lab_test", annualLimit: input.labTestLimit, spentAmount: 0 }),
      ]));
    });

    it("throws when wallet already exists for employee and policy year", async () => {
      const input = createWalletInput();
      const existingWallet = createWallet();

      mockRepo.findWalletByEmployeeAndYear.mockResolvedValue(existingWallet);

      await expect(service.createWalletForEmployee(input)).rejects.toThrow("Wallet already exists for this employee and policy year");
      expect(mockRepo.createWallet).not.toHaveBeenCalled();
      expect(mockRepo.createWalletCategories).not.toHaveBeenCalled();
    });
  });

  describe("getOrCreateWallet", () => {
    it("returns existing wallet if found", async () => {
      const existingWallet = createWallet();
      mockRepo.findWalletByEmployeeAndYear.mockResolvedValue(existingWallet);

      const result = await service.getOrCreateWallet(
        "emp-123",
        "policy-123",
        new Date("2024-01-01"),
        new Date("2024-12-31"),
        50000,
        30000,
        20000
      );

      expect(result).toEqual(existingWallet);
      expect(mockRepo.createWallet).not.toHaveBeenCalled();
    });

    it("creates new wallet if none exists", async () => {
      const newWallet = createWallet();
      mockRepo.findWalletByEmployeeAndYear.mockResolvedValue(undefined);
      mockRepo.createWallet.mockResolvedValue(newWallet);
      mockRepo.createWalletCategories.mockResolvedValue([
        { id: "cat-1", walletId: newWallet.id, category: "consultation", annualLimit: 50000, spentAmount: 0, createdAt: new Date(), updatedAt: new Date() },
        { id: "cat-2", walletId: newWallet.id, category: "medicine", annualLimit: 30000, spentAmount: 0, createdAt: new Date(), updatedAt: new Date() },
        { id: "cat-3", walletId: newWallet.id, category: "lab_test", annualLimit: 20000, spentAmount: 0, createdAt: new Date(), updatedAt: new Date() },
      ]);

      const result = await service.getOrCreateWallet(
        "emp-123",
        "policy-123",
        new Date("2024-01-01"),
        new Date("2024-12-31"),
        50000,
        30000,
        20000
      );

      expect(result).toEqual(newWallet);
      expect(mockRepo.createWallet).toHaveBeenCalled();
    });
  });

  describe("getWalletBalance", () => {
    it("returns correct computed balances for all categories", async () => {
      const wallet = createWallet({ id: "wallet-123", employeeId: "emp-123" });
      const categories = [
        createWalletCategory({ category: "consultation", annualLimit: 50000, spentAmount: 10000 }),
        createWalletCategory({ category: "medicine", annualLimit: 30000, spentAmount: 5000 }),
        createWalletCategory({ category: "lab_test", annualLimit: 20000, spentAmount: 2000 }),
      ];

      mockRepo.getActiveWallet.mockResolvedValue(wallet);
      mockRepo.getWalletCategories.mockResolvedValue(categories);
      mockRepo.getCategoryBalance
        .mockResolvedValueOnce(-10000) // consultation spent
        .mockResolvedValueOnce(-5000)   // medicine spent
        .mockResolvedValueOnce(-2000);  // lab_test spent

      const result = await service.getWalletBalance("emp-123");

      expect(result.walletId).toBe("wallet-123");
      expect(result.employeeId).toBe("emp-123");
      expect(result.categories).toHaveLength(3);
      expect(result.categories[0]).toMatchObject({
        category: "consultation",
        annualLimit: 50000,
        spent: 10000,
        available: 40000,
      });
      expect(result.categories[1]).toMatchObject({
        category: "medicine",
        annualLimit: 30000,
        spent: 5000,
        available: 25000,
      });
      expect(result.categories[2]).toMatchObject({
        category: "lab_test",
        annualLimit: 20000,
        spent: 2000,
        available: 18000,
      });
      expect(result.totalAnnualLimit).toBe(100000);
      expect(result.totalSpent).toBe(17000);
      expect(result.totalAvailable).toBe(83000);
    });

    it("throws when no active wallet found", async () => {
      mockRepo.getActiveWallet.mockResolvedValue(undefined);

      await expect(service.getWalletBalance("emp-123")).rejects.toThrow("No active wallet found for employee");
    });

    it("handles zero balance correctly", async () => {
      const wallet = createWallet();
      const categories = [
        createWalletCategory({ category: "consultation", annualLimit: 50000, spentAmount: 0 }),
      ];

      mockRepo.getActiveWallet.mockResolvedValue(wallet);
      mockRepo.getWalletCategories.mockResolvedValue(categories);
      mockRepo.getCategoryBalance.mockResolvedValue(0);

      const result = await service.getWalletBalance("emp-123");

      expect(Number(result.categories[0].spent)).toBe(0);
      expect(result.categories[0].available).toBe(50000);
    });

    it("handles negative balance correctly (available never negative)", async () => {
      const wallet = createWallet();
      const categories = [
        createWalletCategory({ category: "consultation", annualLimit: 50000, spentAmount: 55000 }),
      ];

      mockRepo.getActiveWallet.mockResolvedValue(wallet);
      mockRepo.getWalletCategories.mockResolvedValue(categories);
      mockRepo.getCategoryBalance.mockResolvedValue(-55000);

      const result = await service.getWalletBalance("emp-123");

      expect(result.categories[0].spent).toBe(55000);
      expect(result.categories[0].available).toBe(0); // Math.max(0, available)
    });
  });

  describe("getWalletTransactions", () => {
    it("returns transactions with default pagination", async () => {
      const transactions = [
        createWalletTransaction({ id: "txn-1", amount: -500, createdAt: new Date("2024-01-15") }),
        createWalletTransaction({ id: "txn-2", amount: 500, createdAt: new Date("2024-01-14") }),
      ];

      mockRepo.getTransactionsByWallet.mockResolvedValue(transactions);

      const result = await service.getWalletTransactions("wallet-123");

      expect(result).toEqual(transactions);
      expect(mockRepo.getTransactionsByWallet).toHaveBeenCalledWith("wallet-123", {
        limit: 50,
        offset: 0,
      });
    });

    it("applies category filter and custom pagination", async () => {
      const transactions = [
        createWalletTransaction({ id: "txn-1", category: "medicine", amount: -200 }),
      ];

      mockRepo.getTransactionsByWallet.mockResolvedValue(transactions);

      const result = await service.getWalletTransactions("wallet-123", {
        category: "medicine",
        limit: 10,
        offset: 5,
      });

      expect(result).toEqual(transactions);
      expect(mockRepo.getTransactionsByWallet).toHaveBeenCalledWith("wallet-123", {
        category: "medicine",
        limit: 10,
        offset: 5,
      });
    });

    it("returns empty array when no transactions", async () => {
      mockRepo.getTransactionsByWallet.mockResolvedValue([]);

      const result = await service.getWalletTransactions("wallet-123");

      expect(result).toEqual([]);
    });
  });

  describe("debitWallet", () => {
    it("debits wallet successfully on valid input", async () => {
      const input = createDebitInput({ amount: 500 });
      const wallet = createWallet({ id: input.walletId, status: "active" });
      const category = createWalletCategory({ walletId: input.walletId, category: input.category, annualLimit: 50000, spentAmount: 10000 });
      const transaction = createWalletTransaction({ walletId: input.walletId, category: input.category, amount: -input.amount, balanceAfter: -10500 });

      mockRepo.findWalletById.mockResolvedValue(wallet);
      mockRepo.getWalletCategory.mockResolvedValue(category);
      mockRepo.getTransactionByIdempotencyKey.mockResolvedValue(undefined);
      mockRepo.getCategoryBalance.mockResolvedValue(-10000); // current balance = -10000 (spent 10000)
      mockRepo.createTransaction.mockResolvedValue(transaction);
      mockRepo.updateCategorySpent.mockResolvedValue({ ...category, spentAmount: 10500 });

      const result = await service.debitWallet(input);

      expect(result).toEqual(transaction);
      expect(mockRepo.findWalletById).toHaveBeenCalledWith(input.walletId);
      expect(mockRepo.getWalletCategory).toHaveBeenCalledWith(input.walletId, input.category);
      expect(mockRepo.createTransaction).toHaveBeenCalledWith(expect.objectContaining({
        walletId: input.walletId,
        category: input.category,
        type: "debit",
        amount: -input.amount,
        balanceAfter: -10500,
        categoryLimitAtTxn: category.annualLimit,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        description: input.description,
        createdBy: input.createdBy,
        idempotencyKey: input.idempotencyKey,
      }));
      expect(mockRepo.updateCategorySpent).toHaveBeenCalledWith(input.walletId, input.category, input.amount);
    });

    it("throws when wallet not found", async () => {
      const input = createDebitInput();
      mockRepo.findWalletById.mockResolvedValue(undefined);

      await expect(service.debitWallet(input)).rejects.toThrow("Wallet not found");
    });

    it("throws when wallet is not active", async () => {
      const input = createDebitInput();
      const wallet = createWallet({ id: input.walletId, status: "expired" });
      mockRepo.findWalletById.mockResolvedValue(wallet);

      await expect(service.debitWallet(input)).rejects.toThrow("Wallet is expired, cannot debit");
    });

    it("throws when category not found in wallet", async () => {
      const input = createDebitInput();
      const wallet = createWallet({ id: input.walletId, status: "active" });
      mockRepo.findWalletById.mockResolvedValue(wallet);
      mockRepo.getWalletCategory.mockResolvedValue(undefined);

      await expect(service.debitWallet(input)).rejects.toThrow(`Category ${input.category} not found in wallet`);
    });

    it("throws when debit would exceed annual limit (insufficient available)", async () => {
      const input = createDebitInput({ amount: 50000 });
      const wallet = createWallet({ id: input.walletId, status: "active" });
      const category = createWalletCategory({ walletId: input.walletId, category: input.category, annualLimit: 50000, spentAmount: 45000 });
      mockRepo.findWalletById.mockResolvedValue(wallet);
      mockRepo.getWalletCategory.mockResolvedValue(category);
      mockRepo.getTransactionByIdempotencyKey.mockResolvedValue(undefined);
      mockRepo.getCategoryBalance.mockResolvedValue(-45000); // spent 45000, balance -45000

      await expect(service.debitWallet(input)).rejects.toThrow("Cannot exceed annual limit for consultation. Limit: 50000, Already spent: 45000, Requested: 50000, Available: 5000");
    });

    it("throws when debit would exceed annual limit", async () => {
      const input = createDebitInput({ amount: 10000 });
      const wallet = createWallet({ id: input.walletId, status: "active" });
      const category = createWalletCategory({ walletId: input.walletId, category: input.category, annualLimit: 50000, spentAmount: 45000 });
      mockRepo.findWalletById.mockResolvedValue(wallet);
      mockRepo.getWalletCategory.mockResolvedValue(category);
      mockRepo.getTransactionByIdempotencyKey.mockResolvedValue(undefined);
      mockRepo.getCategoryBalance.mockResolvedValue(-45000); // spent 45000

      await expect(service.debitWallet(input)).rejects.toThrow("Cannot exceed annual limit for consultation. Limit: 50000, Already spent: 45000, Requested: 10000");
    });

    it("returns existing transaction on idempotent request", async () => {
      const input = createDebitInput({ idempotencyKey: "idem-123" });
      const existingTxn = createWalletTransaction({ idempotencyKey: "idem-123" });
      const wallet = createWallet({ id: input.walletId, status: "active" });
      const category = createWalletCategory({ walletId: input.walletId, category: input.category });

      mockRepo.findWalletById.mockResolvedValue(wallet);
      mockRepo.getWalletCategory.mockResolvedValue(category);
      mockRepo.getTransactionByIdempotencyKey.mockResolvedValue(existingTxn);

      const result = await service.debitWallet(input);

      expect(result).toEqual(existingTxn);
      expect(mockRepo.createTransaction).not.toHaveBeenCalled();
      expect(mockRepo.updateCategorySpent).not.toHaveBeenCalled();
    });

    it("throws when category balance would go negative beyond annual limit", async () => {
      const input = createDebitInput({ amount: 60000 });
      const wallet = createWallet({ id: input.walletId, status: "active" });
      const category = createWalletCategory({ walletId: input.walletId, category: input.category, annualLimit: 50000, spentAmount: 0 });
      mockRepo.findWalletById.mockResolvedValue(wallet);
      mockRepo.getWalletCategory.mockResolvedValue(category);
      mockRepo.getTransactionByIdempotencyKey.mockResolvedValue(undefined);
      mockRepo.getCategoryBalance.mockResolvedValue(0);

      await expect(service.debitWallet(input)).rejects.toThrow("Cannot exceed annual limit for consultation. Limit: 50000, Already spent: 0, Requested: 60000");
    });
  });

  describe("creditWallet", () => {
    it("credits wallet successfully on valid input", async () => {
      const input = createCreditInput({ amount: 500 });
      const wallet = createWallet({ id: input.walletId, status: "active" });
      const category = createWalletCategory({ walletId: input.walletId, category: input.category, annualLimit: 50000, spentAmount: 10000 });
      const transaction = createWalletTransaction({ walletId: input.walletId, category: input.category, amount: input.amount, balanceAfter: -9500, type: "credit" });

      mockRepo.findWalletById.mockResolvedValue(wallet);
      mockRepo.getWalletCategory.mockResolvedValue(category);
      mockRepo.getTransactionByIdempotencyKey.mockResolvedValue(undefined);
      mockRepo.getCategoryBalance.mockResolvedValue(-10000); // spent 10000
      mockRepo.createTransaction.mockResolvedValue(transaction);
      mockRepo.updateCategorySpent.mockResolvedValue({ ...category, spentAmount: 9500 });

      const result = await service.creditWallet(input);

      expect(result).toEqual(transaction);
      expect(mockRepo.createTransaction).toHaveBeenCalledWith(expect.objectContaining({
        walletId: input.walletId,
        category: input.category,
        type: "credit",
        amount: input.amount,
        balanceAfter: -9500,
        categoryLimitAtTxn: category.annualLimit,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        description: input.description,
        createdBy: input.createdBy,
        idempotencyKey: input.idempotencyKey,
      }));
      expect(mockRepo.updateCategorySpent).toHaveBeenCalledWith(input.walletId, input.category, -input.amount);
    });

    it("throws when wallet not found", async () => {
      const input = createCreditInput();
      mockRepo.findWalletById.mockResolvedValue(undefined);

      await expect(service.creditWallet(input)).rejects.toThrow("Wallet not found");
    });

    it("throws when wallet is not active", async () => {
      const input = createCreditInput();
      const wallet = createWallet({ id: input.walletId, status: "expired" });
      mockRepo.findWalletById.mockResolvedValue(wallet);

      await expect(service.creditWallet(input)).rejects.toThrow("Wallet is expired, cannot credit");
    });

    it("throws when category not found in wallet", async () => {
      const input = createCreditInput();
      const wallet = createWallet({ id: input.walletId, status: "active" });
      mockRepo.findWalletById.mockResolvedValue(wallet);
      mockRepo.getWalletCategory.mockResolvedValue(undefined);

      await expect(service.creditWallet(input)).rejects.toThrow(`Category ${input.category} not found in wallet`);
    });

    it("throws when credit would exceed annual limit", async () => {
      const input = createCreditInput({ amount: 50000 });
      const wallet = createWallet({ id: input.walletId, status: "active" });
      const category = createWalletCategory({ walletId: input.walletId, category: input.category, annualLimit: 50000, spentAmount: 0 });
      mockRepo.findWalletById.mockResolvedValue(wallet);
      mockRepo.getWalletCategory.mockResolvedValue(category);
      mockRepo.getTransactionByIdempotencyKey.mockResolvedValue(undefined);
      mockRepo.getCategoryBalance.mockResolvedValue(0); // spent 0

      await expect(service.creditWallet(input)).rejects.toThrow("Credit would exceed available spent amount. Spent: 0, Credit: 50000");
    });

    it("throws when credit exceeds spent amount (can't credit more than spent)", async () => {
      const input = createCreditInput({ amount: 10000 });
      const wallet = createWallet({ id: input.walletId, status: "active" });
      const category = createWalletCategory({ walletId: input.walletId, category: input.category, annualLimit: 50000, spentAmount: 5000 });
      mockRepo.findWalletById.mockResolvedValue(wallet);
      mockRepo.getWalletCategory.mockResolvedValue(category);
      mockRepo.getTransactionByIdempotencyKey.mockResolvedValue(undefined);
      mockRepo.getCategoryBalance.mockResolvedValue(-5000); // spent 5000

      await expect(service.creditWallet(input)).rejects.toThrow("Credit would exceed available spent amount. Spent: 5000, Credit: 10000");
    });

    it("returns existing transaction on idempotent request", async () => {
      const input = createCreditInput({ idempotencyKey: "idem-456" });
      const existingTxn = createWalletTransaction({ idempotencyKey: "idem-456", type: "credit" });
      const wallet = createWallet({ id: input.walletId, status: "active" });
      const category = createWalletCategory({ walletId: input.walletId, category: input.category });

      mockRepo.findWalletById.mockResolvedValue(wallet);
      mockRepo.getWalletCategory.mockResolvedValue(category);
      mockRepo.getTransactionByIdempotencyKey.mockResolvedValue(existingTxn);

      const result = await service.creditWallet(input);

      expect(result).toEqual(existingTxn);
      expect(mockRepo.createTransaction).not.toHaveBeenCalled();
      expect(mockRepo.updateCategorySpent).not.toHaveBeenCalled();
    });
  });

  describe("refundWallet", () => {
    it("processes refund successfully", async () => {
      const input = createRefundInput({ amount: 500 });
      const originalTxn = createWalletTransaction({ id: input.originalTransactionId, walletId: input.walletId, category: input.category, type: "debit", amount: -1000 });
      const wallet = createWallet({ id: input.walletId, status: "active" });
      const category = createWalletCategory({ walletId: input.walletId, category: input.category });
      const refundTxn = createWalletTransaction({ walletId: input.walletId, category: input.category, type: "credit", amount: 500, sourceType: "refund", sourceId: input.originalTransactionId });

      mockRepo.getTransactionById.mockResolvedValue(originalTxn);
      mockRepo.getTransactionsBySource.mockResolvedValue([]);
      mockRepo.findWalletById.mockResolvedValue(wallet);
      mockRepo.getWalletCategory.mockResolvedValue(category);
      mockRepo.getTransactionByIdempotencyKey.mockResolvedValue(undefined);
      mockRepo.getCategoryBalance.mockResolvedValue(-1000);
      mockRepo.createTransaction.mockResolvedValue(refundTxn);
      mockRepo.updateCategorySpent.mockResolvedValue({ ...category, spentAmount: 500 });

      const result = await service.refundWallet(input);

      expect(result).toEqual(refundTxn);
      expect(mockRepo.getTransactionById).toHaveBeenCalledWith(input.originalTransactionId);
      expect(mockRepo.getTransactionsBySource).toHaveBeenCalledWith("refund", input.originalTransactionId);
    });

    it("throws when original transaction not found", async () => {
      const input = createRefundInput();
      mockRepo.getTransactionById.mockResolvedValue(undefined);

      await expect(service.refundWallet(input)).rejects.toThrow("Original transaction not found");
    });

    it("throws when original transaction is not a debit", async () => {
      const input = createRefundInput();
      const originalTxn = createWalletTransaction({ type: "credit" });
      mockRepo.getTransactionById.mockResolvedValue(originalTxn);

      await expect(service.refundWallet(input)).rejects.toThrow("Can only refund debit transactions");
    });

    it("throws when category mismatches original transaction", async () => {
      const input = createRefundInput({ category: "medicine" });
      const originalTxn = createWalletTransaction({ category: "consultation" });
      mockRepo.getTransactionById.mockResolvedValue(originalTxn);

      await expect(service.refundWallet(input)).rejects.toThrow("Category mismatch with original transaction");
    });

    it("throws when wallet mismatches original transaction", async () => {
      const input = createRefundInput({ walletId: "wallet-999" });
      const originalTxn = createWalletTransaction({ walletId: "wallet-123" });
      mockRepo.getTransactionById.mockResolvedValue(originalTxn);

      await expect(service.refundWallet(input)).rejects.toThrow("Wallet mismatch with original transaction");
    });

    it("throws when refund amount exceeds original debit amount", async () => {
      const input = createRefundInput({ amount: 1500 });
      const originalTxn = createWalletTransaction({ amount: -1000 }); // original was 1000
      mockRepo.getTransactionById.mockResolvedValue(originalTxn);
      mockRepo.getTransactionsBySource.mockResolvedValue([]);

      await expect(service.refundWallet(input)).rejects.toThrow("Refund amount 1500 exceeds original debit 1000");
    });

    it("throws when total refunds would exceed original amount", async () => {
      const input = createRefundInput({ amount: 600 });
      const originalTxn = createWalletTransaction({ id: "txn-123", amount: -1000 });
      const existingRefund = createWalletTransaction({ sourceType: "refund", sourceId: "txn-123", amount: 500 });
      mockRepo.getTransactionById.mockResolvedValue(originalTxn);
      mockRepo.getTransactionsBySource.mockResolvedValue([existingRefund]);

      await expect(service.refundWallet(input)).rejects.toThrow("Total refunds would exceed original amount. Already refunded: 500");
    });

    it("allows partial refund", async () => {
      const input = createRefundInput({ amount: 300 });
      const originalTxn = createWalletTransaction({ id: "txn-123", amount: -1000 });
      const wallet = createWallet({ id: input.walletId, status: "active" });
      const category = createWalletCategory({ walletId: input.walletId, category: input.category });
      const refundTxn = createWalletTransaction({ type: "credit", amount: 300 });

      mockRepo.getTransactionById.mockResolvedValue(originalTxn);
      mockRepo.getTransactionsBySource.mockResolvedValue([]);
      mockRepo.findWalletById.mockResolvedValue(wallet);
      mockRepo.getWalletCategory.mockResolvedValue(category);
      mockRepo.getTransactionByIdempotencyKey.mockResolvedValue(undefined);
      mockRepo.getCategoryBalance.mockResolvedValue(-1000);
      mockRepo.createTransaction.mockResolvedValue(refundTxn);
      mockRepo.updateCategorySpent.mockResolvedValue({ ...category, spentAmount: 700 });

      const result = await service.refundWallet(input);

      expect(result).toEqual(refundTxn);
    });
  });

  describe("runPolicyYearEndSnapshot", () => {
    it("creates snapshots with correct unclaimed amounts for all wallets", async () => {
      const policyYearEnd = new Date("2024-12-31");
      const wallet1 = createWallet({ id: "wallet-1", employeeId: "emp-1" });
      const wallet2 = createWallet({ id: "wallet-2", employeeId: "emp-2" });

      const categories1 = [
        createWalletCategory({ walletId: "wallet-1", category: "consultation", annualLimit: 50000, spentAmount: 10000 }),
        createWalletCategory({ walletId: "wallet-1", category: "medicine", annualLimit: 30000, spentAmount: 5000 }),
        createWalletCategory({ walletId: "wallet-1", category: "lab_test", annualLimit: 20000, spentAmount: 2000 }),
      ];
      const categories2 = [
        createWalletCategory({ walletId: "wallet-2", category: "consultation", annualLimit: 50000, spentAmount: 50000 }), // fully spent
        createWalletCategory({ walletId: "wallet-2", category: "medicine", annualLimit: 30000, spentAmount: 10000 }),
      ];

      mockRepo.findWalletsByPolicyYearEnd.mockResolvedValue([wallet1, wallet2]);
      mockRepo.getWalletCategories
        .mockResolvedValueOnce(categories1)
        .mockResolvedValueOnce(categories2);
      mockRepo.getCategoryBalance
        .mockResolvedValueOnce(-10000) // wallet1 consultation spent 10000
        .mockResolvedValueOnce(-5000)  // wallet1 medicine spent 5000
        .mockResolvedValueOnce(-2000)  // wallet1 lab_test spent 2000
        .mockResolvedValueOnce(-50000) // wallet2 consultation spent 50000
        .mockResolvedValueOnce(-10000); // wallet2 medicine spent 10000
      mockRepo.createExpirySnapshot.mockResolvedValue(createWalletExpirySnapshot({}));
      mockRepo.updateWalletStatus.mockResolvedValue({ ...wallet1, status: "expired" });

      const results = await service.runPolicyYearEndSnapshot(policyYearEnd);

      expect(results).toHaveLength(2);

      // Wallet 1: 3 categories with unclaimed
      expect(results[0]).toMatchObject({
        walletId: "wallet-1",
        employeeId: "emp-1",
        snapshotsCreated: 3,
        totalUnclaimed: 83000, // (50000-10000) + (30000-5000) + (20000-2000) = 40000 + 25000 + 18000 = 83000
      });

      // Wallet 2: 1 category with unclaimed (medicine), consultation fully spent
      expect(results[1]).toMatchObject({
        walletId: "wallet-2",
        employeeId: "emp-2",
        snapshotsCreated: 1,
        totalUnclaimed: 20000, // 30000 - 10000 = 20000
      });

      expect(mockRepo.findWalletsByPolicyYearEnd).toHaveBeenCalledWith(policyYearEnd);
      expect(mockRepo.createExpirySnapshot).toHaveBeenCalledTimes(4); // 3 for wallet1, 1 for wallet2
      expect(mockRepo.updateWalletStatus).toHaveBeenCalledTimes(2);
    });

    it("creates snapshot only for categories with unclaimed amount > 0", async () => {
      const policyYearEnd = new Date("2024-12-31");
      const wallet = createWallet({ id: "wallet-1", employeeId: "emp-1" });
      const categories = [
        createWalletCategory({ walletId: "wallet-1", category: "consultation", annualLimit: 50000, spentAmount: 50000 }), // fully spent
        createWalletCategory({ walletId: "wallet-1", category: "medicine", annualLimit: 30000, spentAmount: 30000 }), // fully spent
        createWalletCategory({ walletId: "wallet-1", category: "lab_test", annualLimit: 20000, spentAmount: 5000 }), // partially spent
      ];

      mockRepo.findWalletsByPolicyYearEnd.mockResolvedValue([wallet]);
      mockRepo.getWalletCategories.mockResolvedValue(categories);
      mockRepo.getCategoryBalance
        .mockResolvedValueOnce(-50000)
        .mockResolvedValueOnce(-30000)
        .mockResolvedValueOnce(-5000);
      mockRepo.createExpirySnapshot.mockResolvedValue(createWalletExpirySnapshot({}));
      mockRepo.updateWalletStatus.mockResolvedValue({ ...wallet, status: "expired" });

      const results = await service.runPolicyYearEndSnapshot(policyYearEnd);

      expect(results[0].snapshotsCreated).toBe(1);
      expect(results[0].totalUnclaimed).toBe(15000);
      expect(mockRepo.createExpirySnapshot).toHaveBeenCalledTimes(1);
      expect(mockRepo.createExpirySnapshot).toHaveBeenCalledWith(expect.objectContaining({
        category: "lab_test",
        unclaimedAmount: 15000,
      }));
    });

    it("handles wallets with no unclaimed amounts", async () => {
      const policyYearEnd = new Date("2024-12-31");
      const wallet = createWallet({ id: "wallet-1", employeeId: "emp-1" });
      const categories = [
        createWalletCategory({ walletId: "wallet-1", category: "consultation", annualLimit: 50000, spentAmount: 50000 }),
      ];

      mockRepo.findWalletsByPolicyYearEnd.mockResolvedValue([wallet]);
      mockRepo.getWalletCategories.mockResolvedValue(categories);
      mockRepo.getCategoryBalance.mockResolvedValue(-50000);
      mockRepo.updateWalletStatus.mockResolvedValue({ ...wallet, status: "expired" });

      const results = await service.runPolicyYearEndSnapshot(policyYearEnd);

      expect(results[0].snapshotsCreated).toBe(0);
      expect(results[0].totalUnclaimed).toBe(0);
      expect(mockRepo.createExpirySnapshot).not.toHaveBeenCalled();
      expect(mockRepo.updateWalletStatus).toHaveBeenCalledWith("wallet-1", "expired");
    });

    it("handles multiple wallets correctly", async () => {
      const policyYearEnd = new Date("2024-12-31");
      const wallets = [
        createWallet({ id: "wallet-1", employeeId: "emp-1" }),
        createWallet({ id: "wallet-2", employeeId: "emp-2" }),
        createWallet({ id: "wallet-3", employeeId: "emp-3" }),
      ];

      mockRepo.findWalletsByPolicyYearEnd.mockResolvedValue(wallets);
      mockRepo.getWalletCategories.mockResolvedValue([]);
      mockRepo.updateWalletStatus.mockResolvedValue({ status: "expired" });

      const results = await service.runPolicyYearEndSnapshot(policyYearEnd);

      expect(results).toHaveLength(3);
      expect(mockRepo.updateWalletStatus).toHaveBeenCalledTimes(3);
    });
  });

  describe("getWalletByEmployee", () => {
    it("returns active wallet for employee", async () => {
      const wallet = createWallet({ employeeId: "emp-123" });
      mockRepo.getActiveWallet.mockResolvedValue(wallet);

      const result = await service.getWalletByEmployee("emp-123");

      expect(result).toEqual(wallet);
      expect(mockRepo.getActiveWallet).toHaveBeenCalledWith("emp-123");
    });

    it("returns undefined when no active wallet", async () => {
      mockRepo.getActiveWallet.mockResolvedValue(undefined);

      const result = await service.getWalletByEmployee("emp-999");

      expect(result).toBeUndefined();
    });
  });

  describe("getWalletById", () => {
    it("returns wallet by id", async () => {
      const wallet = createWallet({ id: "wallet-123" });
      mockRepo.findWalletById.mockResolvedValue(wallet);

      const result = await service.getWalletById("wallet-123");

      expect(result).toEqual(wallet);
    });

    it("returns undefined for non-existent wallet", async () => {
      mockRepo.findWalletById.mockResolvedValue(undefined);

      const result = await service.getWalletById("non-existent");

      expect(result).toBeUndefined();
    });
  });
});