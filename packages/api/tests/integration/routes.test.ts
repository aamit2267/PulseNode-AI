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

async function createPolicy(companyId: string, tierName = "Gold") {
  const res = await app.inject({
    method: "POST",
    url: `/companies/${companyId}/policies`,
    payload: {
      tierName,
      sumInsured: 500_000,
      policyKind: "family_floater",
      coverageBasis: "lump_sum",
      walletLimitConsultation: 10_000,
      walletLimitMedicine: 8_000,
      walletLimitLabTest: 5_000,
      effectiveFrom: "2026-04-01",
    },
  });
  expect(res.statusCode).toBe(201);
  return res.json() as { id: string; version: number };
}

function multipartCsv(content: string): {
  payload: Buffer;
  headers: Record<string, string>;
} {
  const boundary = "----vitestboundary";
  const payload = Buffer.from(
    [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="employees.csv"',
      "Content-Type: text/csv",
      "",
      content,
      `--${boundary}--`,
      "",
    ].join("\r\n"),
  );
  return {
    payload,
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
  };
}

describe("companies routes", () => {
  it("POST /companies validates input", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/companies",
      payload: { name: "" },
    });
    expect(res.statusCode).toBe(400);
    // Client-agnostic error shape: structured JSON, no HTML.
    expect(res.headers["content-type"]).toContain("application/json");
    expect(res.json()).toHaveProperty("error");
  });

  it("POST /companies creates and GET /companies/:id fetches", async () => {
    const { id } = await createCompany();
    const res = await app.inject({ method: "GET", url: `/companies/${id}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe("Acme Corp");
  });
});

describe("policies routes", () => {
  it("POST .../policies creates version 1", async () => {
    const company = await createCompany();
    const policy = await createPolicy(company.id);
    expect(policy.version).toBe(1);
  });

  it("PATCH /policies/:id versions instead of mutating, and enrolled employees keep their original policy_id", async () => {
    const company = await createCompany();
    const v1 = await createPolicy(company.id);

    // Enroll an employee under v1 via manual add.
    const addRes = await app.inject({
      method: "POST",
      url: `/companies/${company.id}/employees`,
      payload: {
        corporateEmail: "jane@acme.example.com",
        name: "Jane Doe",
        mobile: "+919800000001",
        policyTierName: "Gold",
        uploadedBy: "admin@acme.example.com",
      },
    });
    expect(addRes.statusCode).toBe(201);
    expect(addRes.json().employee.policyId).toBe(v1.id);

    // Edit the policy.
    const editRes = await app.inject({
      method: "PATCH",
      url: `/policies/${v1.id}`,
      payload: { sumInsured: 750_000 },
    });
    expect(editRes.statusCode).toBe(200);
    const v2 = editRes.json();
    expect(v2.id).not.toBe(v1.id);
    expect(v2.version).toBe(2);

    // Original row intact and retired.
    const v1After = (
      await app.inject({ method: "GET", url: `/policies/${v1.id}` })
    ).json();
    expect(v1After.sumInsured).toBe(500_000);
    expect(v1After.isActive).toBe(false);

    // Employee still points at v1 — enrollment is a historical fact.
    const empRes = await app.inject({
      method: "GET",
      url: `/companies/${company.id}/employees`,
    });
    expect(empRes.statusCode).toBe(200);
    expect(empRes.json()[0].policyId).toBe(v1.id);
  });
});

describe("employee ingestion routes", () => {
  it("POST .../employees/ingest happy path: creates employees, returns batch summary", async () => {
    const company = await createCompany();
    await createPolicy(company.id);

    const { payload, headers } = multipartCsv(
      [
        "corporate_email,name,mobile,position_grade,policy_tier_name",
        "jane@acme.example.com,Jane Doe,+919800000001,L2,Gold",
        "raj@acme.example.com,Raj Patel,+919800000002,L1,",
      ].join("\n"),
    );

    const res = await app.inject({
      method: "POST",
      url: `/companies/${company.id}/employees/ingest?uploadedBy=admin@acme.example.com`,
      payload,
      headers,
    });

    expect(res.statusCode).toBe(201);
    const batch = res.json();
    expect(batch.rowCount).toBe(2);
    expect(batch.createdCount).toBe(2);
    expect(batch.failedCount).toBe(0);
    expect(batch.source).toBe("csv");

    const employees = (
      await app.inject({
        method: "GET",
        url: `/companies/${company.id}/employees`,
      })
    ).json();
    expect(employees).toHaveLength(2);
  });

  it("POST .../employees/ingest with malformed rows processes good rows and reports bad ones", async () => {
    const company = await createCompany();
    await createPolicy(company.id);

    const { payload, headers } = multipartCsv(
      [
        "corporate_email,name,mobile,position_grade,policy_tier_name",
        "good@acme.example.com,Good Row,+919800000001,,Gold",
        ",Missing Email,+919800000002,,",
        "typo@acme.example.com,Typo Tier,+919800000003,,Platinumm",
      ].join("\n"),
    );

    const res = await app.inject({
      method: "POST",
      url: `/companies/${company.id}/employees/ingest?uploadedBy=admin@acme.example.com`,
      payload,
      headers,
    });

    expect(res.statusCode).toBe(201);
    const batch = res.json();
    expect(batch.rowCount).toBe(3);
    expect(batch.createdCount).toBe(1);
    expect(batch.failedCount).toBe(2);
    expect(batch.errorLog).toHaveLength(2);
    expect(JSON.stringify(batch.errorLog)).toMatch(/Platinumm/);
  });

  it("POST .../employees manual add validates and creates via shared logic", async () => {
    const company = await createCompany();
    await createPolicy(company.id);

    const bad = await app.inject({
      method: "POST",
      url: `/companies/${company.id}/employees`,
      payload: { corporateEmail: "not-an-email", name: "", mobile: "" },
    });
    expect(bad.statusCode).toBe(400);

    const res = await app.inject({
      method: "POST",
      url: `/companies/${company.id}/employees`,
      payload: {
        corporateEmail: "solo@acme.example.com",
        name: "Solo Add",
        mobile: "+919811111111",
        policyTierName: "Gold",
        uploadedBy: "admin@acme.example.com",
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().status).toBe("created");
    expect(res.json().batch.source).toBe("manual");
  });

  it("manual add with unknown tier returns 422 and creates no employee", async () => {
    const company = await createCompany();
    const res = await app.inject({
      method: "POST",
      url: `/companies/${company.id}/employees`,
      payload: {
        corporateEmail: "solo@acme.example.com",
        name: "Solo Add",
        mobile: "+919811111111",
        policyTierName: "Unknown",
        uploadedBy: "admin@acme.example.com",
      },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toMatch(/Unknown/);

    const employees = (
      await app.inject({
        method: "GET",
        url: `/companies/${company.id}/employees`,
      })
    ).json();
    expect(employees).toHaveLength(0);
  });
});
