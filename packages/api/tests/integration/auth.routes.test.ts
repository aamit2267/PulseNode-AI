import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
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

async function createTestCompany() {
  const res = await app.inject({
    method: "POST",
    url: "/companies",
    payload: { name: "Acme Corp", corporateEmailDomain: "acme.example.com" },
  });
  expect(res.statusCode).toBe(201);
  return res.json() as { id: string };
}

async function seedEmployee(companyId: string, email: string) {
  const res = await app.inject({
    method: "POST",
    url: `/companies/${companyId}/employees`,
    payload: {
      corporateEmail: email,
      name: "Test Employee",
      mobile: "+919800000001",
      uploadedBy: "admin@acme.example.com",
    },
  });
  expect(res.statusCode).toBe(201);
  return res.json();
}

describe("Auth Routes - Employee", () => {
  let companyId: string;

  beforeEach(async () => {
    const company = await createTestCompany();
    companyId = company.id;
    await seedEmployee(companyId, "jane@acme.example.com");
  });

  it("POST /auth/employee/login succeeds with valid email", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/employee/login",
      payload: { email: "jane@acme.example.com" },
    });

    console.log("Response:", res.statusCode, res.json(), res.payload);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty("customToken");
    expect(body.user).toMatchObject({
      email: "jane@acme.example.com",
      userType: "employee",
      companyId,
    });
    expect(body.requiresTotp).toBe(false);
  });

  it("POST /auth/employee/login fails for unknown email", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/employee/login",
      payload: { email: "unknown@acme.example.com" },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error).toMatch(/not registered/i);
  });

  it("POST /auth/employee/login fails for inactive employee", async () => {
    // Deactivate employee
    const emp = await app.inject({
      method: "GET",
      url: `/companies/${companyId}/employees`,
    });
    const employee = emp.json()[0];
    await testDb
      .update(employees)
      .set({ status: "inactive" })
      .where(eq(employees.id, employee.id));

    const res = await app.inject({
      method: "POST",
      url: "/auth/employee/login",
      payload: { email: "jane@acme.example.com" },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error).toMatch(/inactive/i);
  });
});

describe("Auth Routes - Doctor", () => {
  let companyId: string;

  beforeEach(async () => {
    const company = await createTestCompany();
    companyId = company.id;
  });

  it("POST /auth/doctor/signup creates pending doctor", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/doctor/signup",
      payload: {
        firebaseUid: "test-firebase-uid-123",
        email: "dr.smith@example.com",
        name: "Dr. Smith",
        city: "Mumbai",
        consultationModes: ["online"],
        consultationFeeOnline: 500,
      },
    });

    console.log("Doctor signup response:", res.statusCode, res.json());
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.doctor).toMatchObject({
      email: "dr.smith@example.com",
      name: "Dr. Smith",
      status: "pending",
    });
    expect(body.message).toMatch(/pending.*approval/i);
  });

  it("POST /auth/doctor/signup rejects duplicate email", async () => {
    await app.inject({
      method: "POST",
      url: "/auth/doctor/signup",
      payload: {
        firebaseUid: "uid-1",
        email: "dr.smith@example.com",
        name: "Dr. Smith",
        city: "Mumbai",
        consultationModes: ["online"],
      },
    });

    const res = await app.inject({
      method: "POST",
      url: "/auth/doctor/signup",
      payload: {
        firebaseUid: "uid-2",
        email: "dr.smith@example.com",
        name: "Dr. Smith 2",
        city: "Delhi",
        consultationModes: ["online"],
      },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/already registered/i);
  });

  it("POST /auth/doctor/login fails for pending doctor", async () => {
    await app.inject({
      method: "POST",
      url: "/auth/doctor/signup",
      payload: {
        firebaseUid: "uid-pending",
        email: "pending@example.com",
        name: "Dr. Pending",
        city: "Mumbai",
        consultationModes: ["online"],
      },
    });

    const res = await app.inject({
      method: "POST",
      url: "/auth/doctor/login",
      payload: { email: "pending@example.com" },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toMatch(/pending.*approval/i);
  });

  it("POST /auth/doctor/login succeeds for approved doctor", async () => {
    // Create and approve doctor
    const signupRes = await app.inject({
      method: "POST",
      url: "/auth/doctor/signup",
      payload: {
        firebaseUid: "uid-approved",
        email: "approved@example.com",
        name: "Dr. Approved",
        city: "Mumbai",
        consultationModes: ["online"],
      },
    });
    const doctorId = signupRes.json().doctor.id;

    // Approve via direct DB update (simulating platform admin action)
    await testDb
      .update(doctors)
      .set({ status: "approved" })
      .where(eq(doctors.id, doctorId));

    const res = await app.inject({
      method: "POST",
      url: "/auth/doctor/login",
      payload: { email: "approved@example.com" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.customToken).toBeTruthy();
    expect(body.user).toMatchObject({
      email: "approved@example.com",
      userType: "doctor",
      status: "approved",
    });
  });
});

describe("Auth Routes - TOTP", () => {
  let companyId: string;
  let employeeId: string;

  beforeEach(async () => {
    const company = await createTestCompany();
    companyId = company.id;
    const empRes = await seedEmployee(companyId, "totpuser@acme.example.com");
    employeeId = empRes.employee.id;
  });

  it("POST /auth/employee/totp/setup returns secret and otpauth URL", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/employee/totp/setup",
      payload: { email: "totpuser@acme.example.com" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty("secret");
    expect(body).toHaveProperty("otpAuthUrl");
    // Email is URL-encoded in the URL
    expect(body.otpAuthUrl).toMatch(/^otpauth:\/\/totp\/PulseNode\.ai:totpuser%40acme\.example\.com\?secret=/);
  });

  it("POST /auth/employee/:id/totp/verify accepts valid TOTP", async () => {
    // Get secret first
    const setupRes = await app.inject({
      method: "POST",
      url: "/auth/employee/totp/setup",
      payload: { email: "totpuser@acme.example.com" },
    });
    const { secret } = setupRes.json();

    // Generate valid TOTP code
    const { authenticator } = await import("otplib");
    const token = authenticator.generate(secret);

    const res = await app.inject({
      method: "POST",
      url: `/auth/employee/${employeeId}/totp/verify`,
      payload: { totpCode: token },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ verified: true });
  });

  it("POST /auth/employee/:id/totp/verify rejects invalid TOTP", async () => {
    const setupRes = await app.inject({
      method: "POST",
      url: "/auth/employee/totp/setup",
      payload: { email: "totpuser@acme.example.com" },
    });
    const { secret } = setupRes.json();

    // Generate an invalid code (different secret)
    const { authenticator } = await import("otplib");
    const token = authenticator.generate("DIFFERENTSECRET123");

    const res = await app.inject({
      method: "POST",
      url: `/auth/employee/${employeeId}/totp/verify`,
      payload: { totpCode: token },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ verified: false });
  });

  it("POST /auth/employee/login requires TOTP after setup", async () => {
    const setupRes = await app.inject({
      method: "POST",
      url: "/auth/employee/totp/setup",
      payload: { email: "totpuser@acme.example.com" },
    });
    const { secret } = setupRes.json();
    const { authenticator } = await import("otplib");
    const token = authenticator.generate(secret);

    // Verify to enable TOTP
    await app.inject({
      method: "POST",
      url: `/auth/employee/${employeeId}/totp/verify`,
      payload: { totpCode: token },
    });

    // Now login without TOTP should fail
    const res = await app.inject({
      method: "POST",
      url: "/auth/employee/login",
      payload: { email: "totpuser@acme.example.com" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().requiresTotp).toBe(true);

    // Login with valid TOTP should succeed
    const validToken = authenticator.generate(secret);
    const res2 = await app.inject({
      method: "POST",
      url: "/auth/employee/login",
      payload: { email: "totpuser@acme.example.com", totpCode: validToken },
    });

    expect(res2.statusCode).toBe(200);
    expect(res2.json().customToken).toBeTruthy();
  });
});

describe("Auth Routes - Admin", () => {
  it("POST /auth/admin/create-platform-admin creates admin", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/admin/create-platform-admin",
      payload: {
        firebaseUid: "platform-admin-uid",
        email: "platform@pulsenode.ai",
        name: "Platform Admin",
      },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().admin).toMatchObject({
      email: "platform@pulsenode.ai",
      name: "Platform Admin",
      role: "platform_admin",
    });
  });

  it("POST /auth/admin/create-company-admin creates company admin", async () => {
    const company = await createTestCompany();

    const res = await app.inject({
      method: "POST",
      url: "/auth/admin/create-company-admin",
      payload: {
        firebaseUid: "company-admin-uid",
        email: "company@acme.example.com",
        name: "Company Admin",
        companyId: company.id,
      },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().admin).toMatchObject({
      email: "company@acme.example.com",
      role: "company_admin",
      companyId: company.id,
    });
  });
});

// Import schema for direct DB updates in tests
import { doctors, employees } from "../../src/db/postgres/schema.js";
import { eq } from "drizzle-orm";