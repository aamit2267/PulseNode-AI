import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { closeTestDb, testDb, truncateAll } from "../helpers/test-db.js";
import { eq } from "drizzle-orm";
import {
  walletCategories,
  walletTransactions,
  wallets,
} from "../../src/db/postgres/schema.js";
import {
  authAdminUsers,
  companies,
  employees,
  policies,
} from "../../src/db/postgres/schema.js";

let app: FastifyInstance;
let companyId: string;
let policyId: string;
let employeeId: string;

beforeEach(async () => {
  await truncateAll();
  app = await buildApp({ db: testDb });

  // Create company
  const [company] = await testDb
    .insert(companies)
    .values({
      name: "Test Company",
      corporateEmailDomain: "test.example.com",
    })
    .returning();
  companyId = company!.id;

  // Create policy
  const [policy] = await testDb
    .insert(policies)
    .values({
      companyId: companyId,
      tierName: "Gold",
      sumInsured: 500000,
      policyKind: "individual",
      coverageBasis: "lump_sum",
      walletLimitConsultation: 50000,
      walletLimitMedicine: 30000,
      walletLimitLabTest: 20000,
      effectiveFrom: new Date("2026-01-01"),
      effectiveTo: new Date("2026-12-31"),
    })
    .returning();
  policyId = policy!.id;

  // Create employee
  const [employee] = await testDb
    .insert(employees)
    .values({
      companyId: companyId,
      policyId: policyId,
      corporateEmail: "emp@test.example.com",
      name: "Test Employee",
      mobile: "+919876543210",
    })
    .returning();
  employeeId = employee!.id;
});

afterAll(async () => {
  await app.close();
  await closeTestDb();
});

async function createWalletWithCategories(employeeId: string, policyId: string) {
  const policyYearStart = new Date("2026-01-01");
  const policyYearEnd = new Date("2026-12-31");

  const [wallet] = await testDb
    .insert(wallets)
    .values({
      employeeId,
      policyId,
      policyYearStart,
      policyYearEnd,
      status: "active",
    })
    .returning();

  await testDb.insert(walletCategories).values([
    {
      walletId: wallet!.id,
      category: "consultation",
      annualLimit: 50000,
      spentAmount: 0,
    },
    {
      walletId: wallet!.id,
      category: "medicine",
      annualLimit: 30000,
      spentAmount: 0,
    },
    {
      walletId: wallet!.id,
      category: "lab_test",
      annualLimit: 20000,
      spentAmount: 0,
    },
  ]);

  return wallet!;
}

describe("Benefits Routes - Employee Wallet", () => {
  describe("GET /benefits/wallet", () => {
    it("returns wallet balance for authenticated employee", async () => {
      await createWalletWithCategories(employeeId, policyId);

      const res = await app.inject({
        method: "GET",
        url: "/benefits/wallet",
        headers: { "x-test-user-id": employeeId, "x-test-user-type": "employee" },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty("walletId");
      expect(body).toHaveProperty("categories");
      expect(body.categories).toHaveLength(3);
      expect(body.totalAnnualLimit).toBe(100000);
      expect(body.totalSpent).toBe(0);
      expect(body.totalAvailable).toBe(100000);
    });

    it("returns 500 when no active wallet", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/benefits/wallet",
        headers: { "x-test-user-id": employeeId, "x-test-user-type": "employee" },
      });

      expect(res.statusCode).toBe(500); // service throws error
    });
  });

  describe("GET /benefits/wallet/transactions", () => {
    it("returns paginated transactions", async () => {
      const wallet = await createWalletWithCategories(employeeId, policyId);

      await testDb.insert(walletTransactions).values([
        {
          walletId: wallet.id,
          category: "consultation",
          type: "debit",
          amount: -500,
          balanceAfter: -500,
          categoryLimitAtTxn: 50000,
          sourceType: "consultation",
          sourceId: null,
          description: "Consultation fee",
          createdBy: employeeId,
        },
        {
          walletId: wallet.id,
          category: "consultation",
          type: "credit",
          amount: 500,
          balanceAfter: 0,
          categoryLimitAtTxn: 50000,
          sourceType: "refund",
          sourceId: null,
          description: "Refund",
          createdBy: employeeId,
        },
      ]);

      const res = await app.inject({
        method: "GET",
        url: "/benefits/wallet/transactions?limit=10&offset=0",
        headers: { "x-test-user-id": employeeId, "x-test-user-type": "employee" },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty("transactions");
      expect(body).toHaveProperty("pagination");
    });

    it("filters by category", async () => {
      const wallet = await createWalletWithCategories(employeeId, policyId);

      await testDb.insert(walletTransactions).values({
        walletId: wallet.id,
        category: "medicine",
        type: "debit",
        amount: -200,
        balanceAfter: -200,
        categoryLimitAtTxn: 30000,
        sourceType: "prescription",
        sourceId: null,
        description: "Medicine",
        createdBy: employeeId,
      });

      const res = await app.inject({
        method: "GET",
        url: "/benefits/wallet/transactions?category=medicine",
        headers: { "x-test-user-id": employeeId, "x-test-user-type": "employee" },
      });

      expect(res.statusCode).toBe(200);
    });
  });

  describe("POST /benefits/wallet/topup", () => {
    it("initiates wallet top-up", async () => {
      await createWalletWithCategories(employeeId, policyId);

      const res = await app.inject({
        method: "POST",
        url: "/benefits/wallet/topup",
        headers: { "x-test-user-id": employeeId, "x-test-user-type": "employee" },
        payload: {
          category: "consultation",
          amount: 5000,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty("orderId");
      expect(body.amount).toBe(5000);
      expect(body.category).toBe("consultation");
    });

    it("validates input", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/benefits/wallet/topup",
        headers: { "x-test-user-id": employeeId, "x-test-user-type": "employee" },
        payload: {
          category: "invalid",
          amount: -100,
        },
      });

      expect(res.statusCode).toBe(400);
    });
  });
});

describe("Benefits Routes - Company Admin", () => {
  let adminUid: string;

  beforeEach(async () => {
    // Create a company admin
    await testDb.insert(authAdminUsers).values({
      firebaseUid: "admin-uid-1",
      email: "admin@test.example.com",
      name: "Test Admin",
      role: "company_admin",
      companyId: companyId,
    });
  });

  describe("GET /companies/:companyId/benefits/policies", () => {
    it("returns policies for company admin", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/companies/${companyId}/benefits/policies`,
        headers: {
          "x-test-user-id": "admin-uid-1",
          "x-test-user-type": "admin",
          "x-test-user-role": "company_admin",
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty("policies");
    });

    it("rejects non-company-admin", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/companies/${companyId}/benefits/policies`,
        headers: {
          "x-test-user-id": "emp-uid-1",
          "x-test-user-type": "employee",
        },
      });

      expect(res.statusCode).toBe(403);
    });
  });

  describe("POST /companies/:companyId/benefits/assign-policy", () => {
    it("assigns policy to employees", async () => {
      // Create another employee
      const [emp2] = await testDb
        .insert(employees)
        .values({
          companyId: companyId,
          corporateEmail: "emp2@test.example.com",
          name: "Test Employee 2",
          mobile: "+919876543211",
        })
        .returning();

      const res = await app.inject({
        method: "POST",
        url: `/companies/${companyId}/benefits/assign-policy`,
        headers: {
          "x-test-user-id": "admin-uid-1",
          "x-test-user-type": "admin",
          "x-test-user-role": "company_admin",
        },
        payload: {
          policyId: policyId,
          employeeIds: [employeeId, emp2!.id],
        },
      });

      expect(res.statusCode).toBe(200);
    });

    it("validates employee IDs", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/companies/${companyId}/benefits/assign-policy`,
        headers: {
          "x-test-user-id": "admin-uid-1",
          "x-test-user-type": "admin",
          "x-test-user-role": "company_admin",
        },
        payload: {
          policyId: policyId,
          employeeIds: [],
        },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe("GET /companies/:companyId/benefits/wallets", () => {
    it("returns employee wallets for company admin", async () => {
      await createWalletWithCategories(employeeId, policyId);

      const res = await app.inject({
        method: "GET",
        url: `/companies/${companyId}/benefits/wallets`,
        headers: {
          "x-test-user-id": "admin-uid-1",
          "x-test-user-type": "admin",
          "x-test-user-role": "company_admin",
        },
      });

      expect(res.statusCode).toBe(200);
    });
  });
});