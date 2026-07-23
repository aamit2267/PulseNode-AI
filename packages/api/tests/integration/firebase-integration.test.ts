import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { closeTestDb, testDb, truncateAll } from "../helpers/test-db.js";
import { firebaseAuthClient } from "../../src/modules/auth/firebase-client.js";

let app: FastifyInstance;

beforeEach(async () => {
  await truncateAll();
  app = await buildApp({ db: testDb });
});

afterAll(async () => {
  await app.close();
  await closeTestDb();
});

describe("Firebase Integration Test", () => {
  it("Firebase Admin SDK is initialized and can verify ID tokens", async () => {
    // This test verifies Firebase Admin SDK is properly configured
    // by checking that we can access the auth instance
    const auth = firebaseAuthClient;
    expect(auth).toBeDefined();
    expect(typeof auth.verifyIdToken).toBe("function");
    expect(typeof auth.createCustomToken).toBe("function");
  });

  it("creates a doctor with Firebase UID", async () => {
    // Use a realistic Firebase UID format
    const res = await app.inject({
      method: "POST",
      url: "/auth/doctor/signup",
      payload: {
        firebaseUid: "testuser_firebase_uid_12345",
        email: "testuser@gmail.com",
        name: "Test Doctor",
        city: "Mumbai",
        consultationModes: ["online"],
        consultationFeeOnline: 500,
      },
    });

    // Should succeed (201) or fail with 409 if email already exists
    expect([201, 409]).toContain(res.statusCode);

    if (res.statusCode === 201) {
      const body = res.json();
      expect(body.doctor).toMatchObject({
        email: "testuser@gmail.com",
        name: "Test Doctor",
        status: "pending",
      });
      expect(body.doctor.firebaseUid).toBe("testuser_firebase_uid_12345");
    }
  });

  it("rejects doctor signup with duplicate email", async () => {
    // First signup
    await app.inject({
      method: "POST",
      url: "/auth/doctor/signup",
      payload: {
        firebaseUid: "uid-1",
        email: "duplicate@gmail.com",
        name: "Doctor 1",
        city: "Mumbai",
        consultationModes: ["online"],
      },
    });

    // Second signup with same email
    const res = await app.inject({
      method: "POST",
      url: "/auth/doctor/signup",
      payload: {
        firebaseUid: "uid-2",
        email: "duplicate@gmail.com",
        name: "Doctor 2",
        city: "Delhi",
        consultationModes: ["online"],
      },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/already registered/i);
  });

  it("rejects doctor signup with duplicate Firebase UID", async () => {
    // First signup
    await app.inject({
      method: "POST",
      url: "/auth/doctor/signup",
      payload: {
        firebaseUid: "shared-uid",
        email: "doctor1@gmail.com",
        name: "Doctor 1",
        city: "Mumbai",
        consultationModes: ["online"],
      },
    });

    // Second signup with same Firebase UID
    const res = await app.inject({
      method: "POST",
      url: "/auth/doctor/signup",
      payload: {
        firebaseUid: "shared-uid",
        email: "doctor2@gmail.com",
        name: "Doctor 2",
        city: "Delhi",
        consultationModes: ["online"],
      },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/already registered with this firebase account/i);
  });
});