import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeTestDb, testDb, truncateAll } from "../helpers/test-db.js";
import { CompaniesRepository } from "../../src/modules/companies/companies.repository.js";
import { PoliciesRepository } from "../../src/modules/policies/policies.repository.js";
import { EmployeesRepository } from "../../src/modules/employees/employees.repository.js";
import { IngestionRepository } from "../../src/modules/ingestion/ingestion.repository.js";
import { EmployeeIngestionService } from "../../src/modules/ingestion/ingestion.service.js";

const companiesRepo = new CompaniesRepository(testDb);
const policiesRepo = new PoliciesRepository(testDb);
const employeesRepo = new EmployeesRepository(testDb);
const ingestionRepo = new IngestionRepository(testDb);
const service = new EmployeeIngestionService(
  employeesRepo,
  policiesRepo,
  ingestionRepo,
);

beforeEach(truncateAll);
afterAll(closeTestDb);

async function seed() {
  const company = await companiesRepo.create({
    name: "Acme Corp",
    corporateEmailDomain: "acme.example.com",
  });
  const gold = await policiesRepo.create({
    companyId: company.id,
    tierName: "Gold",
    sumInsured: 500_000,
    policyKind: "family_floater",
    coverageBasis: "lump_sum",
    walletLimitConsultation: 10_000,
    walletLimitMedicine: 8_000,
    walletLimitLabTest: 5_000,
    effectiveFrom: "2026-04-01",
  });
  const silver = await policiesRepo.create({
    companyId: company.id,
    tierName: "Silver",
    sumInsured: 300_000,
    policyKind: "individual",
    coverageBasis: "lump_sum",
    walletLimitConsultation: 6_000,
    walletLimitMedicine: 4_000,
    walletLimitLabTest: 3_000,
    effectiveFrom: "2026-04-01",
  });
  return { company, gold, silver };
}

const row = (
  email: string,
  overrides: Partial<{
    name: string;
    mobile: string;
    positionGrade: string;
    policyTierName: string;
  }> = {},
  rowNumber = 2,
) => ({
  rowNumber,
  corporateEmail: email,
  name: overrides.name ?? "Test Person",
  mobile: overrides.mobile ?? "+919800000001",
  ...(overrides.positionGrade ? { positionGrade: overrides.positionGrade } : {}),
  ...(overrides.policyTierName
    ? { policyTierName: overrides.policyTierName }
    : {}),
});

describe("policy assignment precedence", () => {
  it("explicit policy_tier_name resolves to the ACTIVE version of that tier", async () => {
    const { company, gold } = await seed();
    const result = await service.ingestRows({
      companyId: company.id,
      source: "manual",
      uploadedBy: "admin@acme.example.com",
      rows: [row("jane@acme.example.com", { policyTierName: "Gold" })],
    });

    expect(result.batch.createdCount).toBe(1);
    const e = await employeesRepo.findByCompanyAndEmail(
      company.id,
      "jane@acme.example.com",
    );
    expect(e?.policyId).toBe(gold.id);
    expect(e?.enrolledAt).not.toBeNull();
  });

  it("explicit tier resolves to the CURRENT active version, not a retired one", async () => {
    const { company, gold } = await seed();
    const v2 = await policiesRepo.createNewVersion(gold.id, {
      sumInsured: 750_000,
    });

    await service.ingestRows({
      companyId: company.id,
      source: "manual",
      uploadedBy: "admin@acme.example.com",
      rows: [row("jane@acme.example.com", { policyTierName: "Gold" })],
    });

    const e = await employeesRepo.findByCompanyAndEmail(
      company.id,
      "jane@acme.example.com",
    );
    expect(e?.policyId).toBe(v2.id);
  });

  it("tier name matching is case-insensitive but otherwise exact — no fuzzy 'closest tier' guessing", async () => {
    const { company, gold } = await seed();
    const result = await service.ingestRows({
      companyId: company.id,
      source: "csv",
      uploadedBy: "admin@acme.example.com",
      rows: [
        row("a@acme.example.com", { policyTierName: "gold" }, 2),
        row("b@acme.example.com", { policyTierName: "Golld" }, 3),
      ],
    });

    const a = await employeesRepo.findByCompanyAndEmail(
      company.id,
      "a@acme.example.com",
    );
    expect(a?.policyId).toBe(gold.id);

    // Typo'd tier: row failed, employee NOT created, batch continued.
    const b = await employeesRepo.findByCompanyAndEmail(
      company.id,
      "b@acme.example.com",
    );
    expect(b).toBeUndefined();
    expect(result.batch.createdCount).toBe(1);
    expect(result.batch.failedCount).toBe(1);
    expect(result.batch.errorLog[0]?.reason).toMatch(/Golld/);
    expect(result.batch.errorLog[0]?.row).toBe(3);
  });

  it("omitted tier leaves the employee validly unassigned (no inference), counted as created", async () => {
    const { company } = await seed();
    const result = await service.ingestRows({
      companyId: company.id,
      source: "csv",
      uploadedBy: "admin@acme.example.com",
      rows: [row("jane@acme.example.com", { positionGrade: "L2" })],
    });

    expect(result.batch.createdCount).toBe(1);
    expect(result.batch.failedCount).toBe(0);
    const e = await employeesRepo.findByCompanyAndEmail(
      company.id,
      "jane@acme.example.com",
    );
    expect(e?.policyId).toBeNull();
    expect(e?.positionGrade).toBe("L2");
    expect(e?.enrolledAt).toBeNull();
  });

  it("tier naming another company's policy does not resolve (company-scoped lookup)", async () => {
    const { company } = await seed();
    const other = await companiesRepo.create({
      name: "Globex",
      corporateEmailDomain: "globex.example.com",
    });
    await policiesRepo.create({
      companyId: other.id,
      tierName: "Platinum",
      sumInsured: 1_000_000,
      policyKind: "individual",
      coverageBasis: "lump_sum",
      walletLimitConsultation: 1,
      walletLimitMedicine: 1,
      walletLimitLabTest: 1,
      effectiveFrom: "2026-04-01",
    });

    const result = await service.ingestRows({
      companyId: company.id,
      source: "csv",
      uploadedBy: "admin@acme.example.com",
      rows: [row("jane@acme.example.com", { policyTierName: "Platinum" })],
    });
    expect(result.batch.failedCount).toBe(1);
    expect(result.batch.createdCount).toBe(0);
  });
});

describe("dedupe on (company_id, corporate_email)", () => {
  it("existing email updates mutable fields instead of creating a duplicate", async () => {
    const { company, gold, silver } = await seed();
    await service.ingestRows({
      companyId: company.id,
      source: "csv",
      uploadedBy: "admin@acme.example.com",
      rows: [row("jane@acme.example.com", { policyTierName: "Gold" })],
    });

    const result = await service.ingestRows({
      companyId: company.id,
      source: "csv",
      uploadedBy: "admin@acme.example.com",
      rows: [
        row("jane@acme.example.com", {
          name: "Jane Renamed",
          mobile: "+919899999999",
          policyTierName: "Silver",
        }),
      ],
    });

    expect(result.batch.createdCount).toBe(0);
    expect(result.batch.updatedCount).toBe(1);

    const all = await employeesRepo.listByCompany(company.id);
    expect(all).toHaveLength(1);
    expect(all[0]!.name).toBe("Jane Renamed");
    expect(all[0]!.mobile).toBe("+919899999999");
    expect(all[0]!.policyId).toBe(silver.id);
    expect(gold.id).not.toBe(silver.id);
  });

  it("re-ingesting an unchanged row counts as skipped, not updated", async () => {
    const { company } = await seed();
    const theRow = row("jane@acme.example.com", { policyTierName: "Gold" });
    await service.ingestRows({
      companyId: company.id,
      source: "csv",
      uploadedBy: "admin@acme.example.com",
      rows: [theRow],
    });
    const result = await service.ingestRows({
      companyId: company.id,
      source: "csv",
      uploadedBy: "admin@acme.example.com",
      rows: [theRow],
    });
    expect(result.batch.createdCount).toBe(0);
    expect(result.batch.updatedCount).toBe(0);
    expect(result.batch.skippedCount).toBe(1);
  });

  it("update path does NOT clear an existing policy when the incoming row omits the tier", async () => {
    const { company, gold } = await seed();
    await service.ingestRows({
      companyId: company.id,
      source: "csv",
      uploadedBy: "admin@acme.example.com",
      rows: [row("jane@acme.example.com", { policyTierName: "Gold" })],
    });

    await service.ingestRows({
      companyId: company.id,
      source: "csv",
      uploadedBy: "admin@acme.example.com",
      rows: [row("jane@acme.example.com", { mobile: "+919877777777" })],
    });

    const e = await employeesRepo.findByCompanyAndEmail(
      company.id,
      "jane@acme.example.com",
    );
    expect(e?.mobile).toBe("+919877777777");
    expect(e?.policyId).toBe(gold.id);
  });
});

describe("batch resilience and recording", () => {
  it("one bad row never fails the batch; counts and error log are accurate", async () => {
    const { company } = await seed();
    const result = await service.ingestRows({
      companyId: company.id,
      source: "xlsx",
      uploadedBy: "admin@acme.example.com",
      rows: [
        row("ok1@acme.example.com", { policyTierName: "Gold" }, 2),
        row("bad@acme.example.com", { policyTierName: "Nonexistent" }, 3),
        row("ok2@acme.example.com", {}, 4),
      ],
      parseErrors: [{ rowNumber: 5, reason: "corporate_email: is required" }],
    });

    expect(result.batch.rowCount).toBe(4);
    expect(result.batch.createdCount).toBe(2);
    expect(result.batch.failedCount).toBe(2);
    expect(result.batch.errorLog).toHaveLength(2);

    const stored = await ingestionRepo.findById(result.batch.id);
    expect(stored?.failedCount).toBe(2);
  });
});

describe("manual add uses the same logic as bulk", () => {
  it("addSingleEmployee creates via the shared path and records a manual-source batch", async () => {
    const { company, gold } = await seed();
    const outcome = await service.addSingleEmployee({
      companyId: company.id,
      uploadedBy: "admin@acme.example.com",
      employee: {
        corporateEmail: "solo@acme.example.com",
        name: "Solo Add",
        mobile: "+919811111111",
        policyTierName: "Gold",
      },
    });

    expect(outcome.status).toBe("created");
    expect(outcome.employee?.policyId).toBe(gold.id);
    expect(outcome.batch.source).toBe("manual");
    expect(outcome.batch.rowCount).toBe(1);
    expect(outcome.batch.createdCount).toBe(1);
  });

  it("addSingleEmployee surfaces an unresolvable tier as a failure, not a silent skip", async () => {
    const { company } = await seed();
    const outcome = await service.addSingleEmployee({
      companyId: company.id,
      uploadedBy: "admin@acme.example.com",
      employee: {
        corporateEmail: "solo@acme.example.com",
        name: "Solo Add",
        mobile: "+919811111111",
        policyTierName: "DoesNotExist",
      },
    });

    expect(outcome.status).toBe("failed");
    expect(outcome.error).toMatch(/DoesNotExist/);
    expect(outcome.batch.failedCount).toBe(1);
    expect(
      await employeesRepo.findByCompanyAndEmail(
        company.id,
        "solo@acme.example.com",
      ),
    ).toBeUndefined();
  });

  it("addSingleEmployee dedupes to an update exactly like bulk", async () => {
    const { company } = await seed();
    await service.addSingleEmployee({
      companyId: company.id,
      uploadedBy: "admin@acme.example.com",
      employee: {
        corporateEmail: "solo@acme.example.com",
        name: "Solo Add",
        mobile: "+919811111111",
      },
    });
    const second = await service.addSingleEmployee({
      companyId: company.id,
      uploadedBy: "admin@acme.example.com",
      employee: {
        corporateEmail: "solo@acme.example.com",
        name: "Solo Renamed",
        mobile: "+919811111111",
      },
    });
    expect(second.status).toBe("updated");
    const all = await employeesRepo.listByCompany(company.id);
    expect(all).toHaveLength(1);
    expect(all[0]!.name).toBe("Solo Renamed");
  });
});
