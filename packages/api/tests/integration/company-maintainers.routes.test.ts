import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { closeTestDb, testDb, truncateAll } from "../helpers/test-db.js";

let app: FastifyInstance;

beforeEach(async () => {
  await truncateAll();
  app = await buildApp({ db: testDb });
});

afterAll(async () => {
  await app.close();
  await closeTestDb();
});

async function createCompany() {
  const res = await app.inject({
    method: "POST",
    url: "/companies",
    payload: { name: "Acme Corp", corporateEmailDomain: "acme.example.com" },
  });
  expect(res.statusCode).toBe(201);
  return res.json() as { id: string };
}

describe("Company Maintainers Routes", () => {
  it("POST /companies/:companyId/maintainers creates a maintainer", async () => {
    const company = await createCompany();

    const res = await app.inject({
      method: "POST",
      url: `/companies/${company.id}/maintainers`,
      payload: { email: "admin@acme.example.com", role: "admin" },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.email).toBe("admin@acme.example.com");
    expect(body.role).toBe("admin");
    expect(body.companyId).toBe(company.id);
  });

  it("POST rejects invalid email", async () => {
    const company = await createCompany();

    const res = await app.inject({
      method: "POST",
      url: `/companies/${company.id}/maintainers`,
      payload: { email: "not-an-email", role: "admin" },
    });

    expect(res.statusCode).toBe(400);
  });

  it("POST rejects invalid role", async () => {
    const company = await createCompany();

    const res = await app.inject({
      method: "POST",
      url: `/companies/${company.id}/maintainers`,
      payload: { email: "admin@acme.example.com", role: "superadmin" },
    });

    expect(res.statusCode).toBe(400);
  });

  it("POST rejects duplicate email for same company", async () => {
    const company = await createCompany();

    await app.inject({
      method: "POST",
      url: `/companies/${company.id}/maintainers`,
      payload: { email: "admin@acme.example.com", role: "admin" },
    });

    const res = await app.inject({
      method: "POST",
      url: `/companies/${company.id}/maintainers`,
      payload: { email: "admin@acme.example.com", role: "maintainer" },
    });

    expect(res.statusCode).toBe(409);
  });

  it("GET /companies/:companyId/maintainers lists all maintainers", async () => {
    const company = await createCompany();

    await app.inject({
      method: "POST",
      url: `/companies/${company.id}/maintainers`,
      payload: { email: "admin@acme.example.com", role: "admin" },
    });
    await app.inject({
      method: "POST",
      url: `/companies/${company.id}/maintainers`,
      payload: { email: "support@acme.example.com", role: "maintainer" },
    });
    await app.inject({
      method: "POST",
      url: `/companies/${company.id}/maintainers`,
      payload: { email: "readonly@acme.example.com", role: "read-only" },
    });

    const res = await app.inject({
      method: "GET",
      url: `/companies/${company.id}/maintainers`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveLength(3);
    const roles = body.map((m: any) => m.role).sort();
    expect(roles).toEqual(["admin", "maintainer", "read-only"]);
  });

  it("PATCH /companies/:companyId/maintainers/:maintainerId updates role", async () => {
    const company = await createCompany();

    const createRes = await app.inject({
      method: "POST",
      url: `/companies/${company.id}/maintainers`,
      payload: { email: "user@acme.example.com", role: "maintainer" },
    });
    const maintainer = createRes.json();

    const res = await app.inject({
      method: "PATCH",
      url: `/companies/${company.id}/maintainers/${maintainer.id}`,
      payload: { role: "admin" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().role).toBe("admin");
  });

  it("PATCH prevents demoting the only admin", async () => {
    const company = await createCompany();

    const createRes = await app.inject({
      method: "POST",
      url: `/companies/${company.id}/maintainers`,
      payload: { email: "sole-admin@acme.example.com", role: "admin" },
    });
    const maintainer = createRes.json();

    const res = await app.inject({
      method: "PATCH",
      url: `/companies/${company.id}/maintainers/${maintainer.id}`,
      payload: { role: "maintainer" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/only admin/i);
  });

  it("PATCH allows demoting admin when another admin exists", async () => {
    const company = await createCompany();

    const admin1 = await app.inject({
      method: "POST",
      url: `/companies/${company.id}/maintainers`,
      payload: { email: "admin1@acme.example.com", role: "admin" },
    });
    const admin2 = await app.inject({
      method: "POST",
      url: `/companies/${company.id}/maintainers`,
      payload: { email: "admin2@acme.example.com", role: "admin" },
    });

    const res = await app.inject({
      method: "PATCH",
      url: `/companies/${company.id}/maintainers/${admin1.json().id}`,
      payload: { role: "maintainer" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().role).toBe("maintainer");
  });

  it("DELETE /companies/:companyId/maintainers/:maintainerId removes maintainer", async () => {
    const company = await createCompany();

    const createRes = await app.inject({
      method: "POST",
      url: `/companies/${company.id}/maintainers`,
      payload: { email: "todelete@acme.example.com", role: "maintainer" },
    });
    const maintainer = createRes.json();

    const res = await app.inject({
      method: "DELETE",
      url: `/companies/${company.id}/maintainers/${maintainer.id}`,
    });

    expect(res.statusCode).toBe(204);

    const listRes = await app.inject({
      method: "GET",
      url: `/companies/${company.id}/maintainers`,
    });
    expect(listRes.json()).toHaveLength(0);
  });

  it("DELETE prevents removing the only admin", async () => {
    const company = await createCompany();

    const createRes = await app.inject({
      method: "POST",
      url: `/companies/${company.id}/maintainers`,
      payload: { email: "sole-admin@acme.example.com", role: "admin" },
    });
    const maintainer = createRes.json();

    const res = await app.inject({
      method: "DELETE",
      url: `/companies/${company.id}/maintainers/${maintainer.id}`,
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/only admin/i);
  });

  it("DELETE allows removing admin when another admin exists", async () => {
    const company = await createCompany();

    await app.inject({
      method: "POST",
      url: `/companies/${company.id}/maintainers`,
      payload: { email: "admin1@acme.example.com", role: "admin" },
    });
    const admin2 = await app.inject({
      method: "POST",
      url: `/companies/${company.id}/maintainers`,
      payload: { email: "admin2@acme.example.com", role: "admin" },
    });

    const res = await app.inject({
      method: "DELETE",
      url: `/companies/${company.id}/maintainers/${admin2.json().id}`,
    });

    expect(res.statusCode).toBe(204);
  });

  it("returns 404 for non-existent maintainer", async () => {
    const company = await createCompany();
    const fakeId = "00000000-0000-0000-0000-000000000000";

    const patchRes = await app.inject({
      method: "PATCH",
      url: `/companies/${company.id}/maintainers/${fakeId}`,
      payload: { role: "admin" },
    });
    expect(patchRes.statusCode).toBe(404);

    const deleteRes = await app.inject({
      method: "DELETE",
      url: `/companies/${company.id}/maintainers/${fakeId}`,
    });
    expect(deleteRes.statusCode).toBe(404);
  });

  it("maintainers are isolated per company", async () => {
    const company1 = await createCompany();
    const company2 = await app.inject({
      method: "POST",
      url: "/companies",
      payload: { name: "Globex", corporateEmailDomain: "globex.example.com" },
    });
    const c2 = company2.json();

    await app.inject({
      method: "POST",
      url: `/companies/${company1.id}/maintainers`,
      payload: { email: "shared@example.com", role: "admin" },
    });
    await app.inject({
      method: "POST",
      url: `/companies/${c2.id}/maintainers`,
      payload: { email: "shared@example.com", role: "read-only" },
    });

    const list1 = await app.inject({
      method: "GET",
      url: `/companies/${company1.id}/maintainers`,
    });
    const list2 = await app.inject({
      method: "GET",
      url: `/companies/${c2.id}/maintainers`,
    });

    expect(list1.json()).toHaveLength(1);
    expect(list1.json()[0].role).toBe("admin");
    expect(list2.json()).toHaveLength(1);
    expect(list2.json()[0].role).toBe("read-only");
  });
});