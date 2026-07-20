import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeTestDb, testDb, truncateAll } from "../helpers/test-db.js";
import { CompaniesRepository } from "../../src/modules/companies/companies.repository.js";
import { CompanyMaintainersRepository } from "../../src/modules/companies/company-maintainers.repository.js";

const companiesRepo = new CompaniesRepository(testDb);
const maintainersRepo = new CompanyMaintainersRepository(testDb);

beforeEach(truncateAll);
afterAll(closeTestDb);

async function seedCompany() {
  return companiesRepo.create({
    name: "Acme Corp",
    corporateEmailDomain: "acme.example.com",
  });
}

describe("CompanyMaintainersRepository", () => {
  it("creates a maintainer with default role 'maintainer'", async () => {
    const company = await seedCompany();
    const maintainer = await maintainersRepo.create({
      companyId: company.id,
      email: "admin@acme.example.com",
      role: "admin",
    });

    expect(maintainer.id).toBeTruthy();
    expect(maintainer.companyId).toBe(company.id);
    expect(maintainer.email).toBe("admin@acme.example.com");
    expect(maintainer.role).toBe("admin");
  });

  it("enforces unique email per company", async () => {
    const company = await seedCompany();
    await maintainersRepo.create({
      companyId: company.id,
      email: "admin@acme.example.com",
      role: "admin",
    });

    await expect(
      maintainersRepo.create({
        companyId: company.id,
        email: "admin@acme.example.com",
        role: "maintainer",
      }),
    ).rejects.toThrow();
  });

  it("allows same email for different companies", async () => {
    const company1 = await seedCompany();
    const company2 = await companiesRepo.create({
      name: "Globex",
      corporateEmailDomain: "globex.example.com",
    });

    await maintainersRepo.create({
      companyId: company1.id,
      email: "shared@example.com",
      role: "admin",
    });

    await expect(
      maintainersRepo.create({
        companyId: company2.id,
        email: "shared@example.com",
        role: "read-only",
      }),
    ).resolves.toBeTruthy();
  });

  it("finds maintainer by company and email (case-insensitive)", async () => {
    const company = await seedCompany();
    await maintainersRepo.create({
      companyId: company.id,
      email: "Admin@Acme.Example.COM",
      role: "admin",
    });

    const found = await maintainersRepo.findByCompanyAndEmail(
      company.id,
      "admin@acme.example.com",
    );
    expect(found).toBeTruthy();
    expect(found?.role).toBe("admin");
  });

  it("lists all maintainers for a company", async () => {
    const company = await seedCompany();
    await maintainersRepo.create({
      companyId: company.id,
      email: "admin@acme.example.com",
      role: "admin",
    });
    await maintainersRepo.create({
      companyId: company.id,
      email: "support@acme.example.com",
      role: "maintainer",
    });
    await maintainersRepo.create({
      companyId: company.id,
      email: "readonly@acme.example.com",
      role: "read-only",
    });

    const list = await maintainersRepo.listByCompany(company.id);
    expect(list).toHaveLength(3);
    const roles = list.map((m) => m.role).sort();
    expect(roles).toEqual(["admin", "maintainer", "read-only"]);
  });

  it("updates maintainer role", async () => {
    const company = await seedCompany();
    const maintainer = await maintainersRepo.create({
      companyId: company.id,
      email: "user@acme.example.com",
      role: "maintainer",
    });

    const updated = await maintainersRepo.updateRole(maintainer.id, "admin");
    expect(updated?.role).toBe("admin");

    const found = await maintainersRepo.findById(maintainer.id);
    expect(found?.role).toBe("admin");
  });

  it("deletes a maintainer", async () => {
    const company = await seedCompany();
    const maintainer = await maintainersRepo.create({
      companyId: company.id,
      email: "todelete@acme.example.com",
      role: "maintainer",
    });

    await maintainersRepo.delete(maintainer.id);
    const found = await maintainersRepo.findById(maintainer.id);
    expect(found).toBeUndefined();
  });

  it("counts admin maintainers for a company", async () => {
    const company = await seedCompany();
    await maintainersRepo.create({
      companyId: company.id,
      email: "admin1@acme.example.com",
      role: "admin",
    });
    await maintainersRepo.create({
      companyId: company.id,
      email: "admin2@acme.example.com",
      role: "admin",
    });
    await maintainersRepo.create({
      companyId: company.id,
      email: "support@acme.example.com",
      role: "maintainer",
    });

    const count = await maintainersRepo.countAdmins(company.id);
    expect(count).toBe(2);
  });
});