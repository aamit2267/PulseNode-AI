import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeTestDb, testDb, truncateAll } from "../helpers/test-db.js";
import { CompaniesRepository } from "../../src/modules/companies/companies.repository.js";
import { PoliciesRepository } from "../../src/modules/policies/policies.repository.js";
import { EmployeesRepository } from "../../src/modules/employees/employees.repository.js";
import { IngestionRepository } from "../../src/modules/ingestion/ingestion.repository.js";

const companiesRepo = new CompaniesRepository(testDb);
const policiesRepo = new PoliciesRepository(testDb);
const employeesRepo = new EmployeesRepository(testDb);
const ingestionRepo = new IngestionRepository(testDb);

beforeEach(truncateAll);
afterAll(closeTestDb);

async function seedCompany() {
  return companiesRepo.create({
    name: "Acme Corp",
    corporateEmailDomain: "acme.example.com",
  });
}

const basePolicy = {
  tierName: "Gold",
  sumInsured: 500_000,
  policyKind: "family_floater" as const,
  coverageBasis: "lump_sum" as const,
  walletLimitConsultation: 10_000,
  walletLimitMedicine: 8_000,
  walletLimitLabTest: 5_000,
  effectiveFrom: "2026-04-01",
};

describe("CompaniesRepository", () => {
  it("creates and fetches a company", async () => {
    const created = await companiesRepo.create({
      name: "Acme Corp",
      corporateEmailDomain: "acme.example.com",
    });
    expect(created.id).toBeTruthy();
    expect(created.mfaRequired).toBe(false);

    const found = await companiesRepo.findById(created.id);
    expect(found?.name).toBe("Acme Corp");
  });

  it("rejects duplicate corporate email domains", async () => {
    await seedCompany();
    await expect(
      companiesRepo.create({
        name: "Other",
        corporateEmailDomain: "acme.example.com",
      }),
    ).rejects.toThrow();
  });

  it("updates mfa_required", async () => {
    const c = await seedCompany();
    const updated = await companiesRepo.update(c.id, { mfaRequired: true });
    expect(updated?.mfaRequired).toBe(true);
  });
});

describe("PoliciesRepository", () => {
  it("creates a policy at version 1, active", async () => {
    const c = await seedCompany();
    const p = await policiesRepo.create({ ...basePolicy, companyId: c.id });
    expect(p.version).toBe(1);
    expect(p.isActive).toBe(true);
    expect(p.effectiveTo).toBeNull();
  });

  it("finds the active version by company + tier name", async () => {
    const c = await seedCompany();
    await policiesRepo.create({ ...basePolicy, companyId: c.id });
    const found = await policiesRepo.findActiveByTierName(c.id, "Gold");
    expect(found?.tierName).toBe("Gold");
    expect(found?.isActive).toBe(true);
  });

  it("editing a policy never mutates the original row — it creates a new version", async () => {
    const c = await seedCompany();
    const v1 = await policiesRepo.create({ ...basePolicy, companyId: c.id });

    const v2 = await policiesRepo.createNewVersion(v1.id, {
      sumInsured: 750_000,
      effectiveFrom: "2026-07-01",
    });

    // New row, incremented version, changed field applied.
    expect(v2.id).not.toBe(v1.id);
    expect(v2.version).toBe(2);
    expect(v2.sumInsured).toBe(750_000);
    expect(v2.isActive).toBe(true);
    // Unchanged fields carried over from v1.
    expect(v2.tierName).toBe("Gold");
    expect(v2.walletLimitMedicine).toBe(8_000);

    // Original row: every business field untouched; only retired.
    const v1After = await policiesRepo.findById(v1.id);
    expect(v1After?.sumInsured).toBe(500_000);
    expect(v1After?.version).toBe(1);
    expect(v1After?.tierName).toBe("Gold");
    expect(v1After?.isActive).toBe(false);
    expect(v1After?.effectiveTo).not.toBeNull();

    // The active lookup now resolves to v2.
    const active = await policiesRepo.findActiveByTierName(c.id, "Gold");
    expect(active?.id).toBe(v2.id);
  });

  it("refuses to version off a retired (inactive) policy row", async () => {
    const c = await seedCompany();
    const v1 = await policiesRepo.create({ ...basePolicy, companyId: c.id });
    await policiesRepo.createNewVersion(v1.id, { sumInsured: 600_000 });
    await expect(
      policiesRepo.createNewVersion(v1.id, { sumInsured: 700_000 }),
    ).rejects.toThrow(/inactive|not active/i);
  });
});

describe("EmployeesRepository", () => {
  it("creates an employee without a policy (valid unassigned state)", async () => {
    const c = await seedCompany();
    const e = await employeesRepo.create({
      companyId: c.id,
      corporateEmail: "jane@acme.example.com",
      name: "Jane Doe",
      mobile: "+919800000001",
    });
    expect(e.policyId).toBeNull();
    expect(e.status).toBe("active");
  });

  it("enforces email uniqueness per company but allows same email across companies", async () => {
    const c1 = await seedCompany();
    const c2 = await companiesRepo.create({
      name: "Globex",
      corporateEmailDomain: "globex.example.com",
    });
    const base = {
      corporateEmail: "shared@contractor.example.com",
      name: "Shared Person",
      mobile: "+919800000002",
    };
    await employeesRepo.create({ ...base, companyId: c1.id });
    await expect(
      employeesRepo.create({ ...base, companyId: c2.id }),
    ).resolves.toBeTruthy();
    await expect(
      employeesRepo.create({ ...base, companyId: c1.id }),
    ).rejects.toThrow();
  });

  it("finds by company + email and updates mutable fields", async () => {
    const c = await seedCompany();
    await employeesRepo.create({
      companyId: c.id,
      corporateEmail: "jane@acme.example.com",
      name: "Jane Doe",
      mobile: "+919800000001",
    });
    const found = await employeesRepo.findByCompanyAndEmail(
      c.id,
      "jane@acme.example.com",
    );
    expect(found).toBeTruthy();

    const updated = await employeesRepo.update(found!.id, {
      name: "Jane D. Doe",
      mobile: "+919800000009",
    });
    expect(updated?.name).toBe("Jane D. Doe");
    expect(updated?.mobile).toBe("+919800000009");
  });

  it("adds and lists dependents as child rows", async () => {
    const c = await seedCompany();
    const e = await employeesRepo.create({
      companyId: c.id,
      corporateEmail: "jane@acme.example.com",
      name: "Jane Doe",
      mobile: "+919800000001",
    });
    await employeesRepo.addDependent(e.id, {
      name: "Sam Doe",
      relationship: "child",
    });
    await employeesRepo.addDependent(e.id, {
      name: "Alex Doe",
      relationship: "spouse",
    });
    const deps = await employeesRepo.listDependents(e.id);
    expect(deps).toHaveLength(2);
    expect(deps.map((d) => d.relationship).sort()).toEqual(["child", "spouse"]);
  });
});

describe("IngestionRepository", () => {
  it("records a batch with counts and a structured error log", async () => {
    const c = await seedCompany();
    const batch = await ingestionRepo.create({
      companyId: c.id,
      source: "csv",
      uploadedBy: "admin@acme.example.com",
      rowCount: 10,
      createdCount: 7,
      updatedCount: 1,
      skippedCount: 0,
      failedCount: 2,
      errorLog: [
        { row: 3, email: "bad@acme.example.com", reason: "unknown tier" },
        { row: 9, reason: "missing corporate_email" },
      ],
    });
    expect(batch.id).toBeTruthy();

    const found = await ingestionRepo.findById(batch.id);
    expect(found?.failedCount).toBe(2);
    expect(found?.errorLog).toHaveLength(2);
    expect(found?.errorLog[0]?.reason).toBe("unknown tier");
  });
});
