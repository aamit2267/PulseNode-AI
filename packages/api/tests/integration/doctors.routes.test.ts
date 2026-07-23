import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { closeTestDb, testDb, truncateAll } from "../helpers/test-db.js";
import { eq, or } from "drizzle-orm";
import { doctors } from "../../src/db/postgres/schema.js";

let app: FastifyInstance;
const platformAdminId = "platform-admin-test";

beforeEach(async () => {
  await truncateAll();
  app = await buildApp({ db: testDb });
});

afterAll(async () => {
  await app.close();
  await closeTestDb();
});

describe("Doctors Routes", () => {
  describe("POST /doctors - Doctor Signup", () => {
    it("creates a doctor with pending status", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/doctors",
        payload: {
          firebaseUid: "doctor-uid-1",
          email: "dr.smith@example.com",
          name: "Dr. Smith",
          city: "Mumbai",
          consultationModes: ["online"],
          consultationFeeOnline: 500,
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.doctor).toMatchObject({
        email: "dr.smith@example.com",
        name: "Dr. Smith",
        city: "Mumbai",
        status: "pending",
      });
      expect(body.message).toMatch(/pending.*approval/i);
    });

    it("rejects duplicate email", async () => {
      await app.inject({
        method: "POST",
        url: "/doctors",
        payload: {
          firebaseUid: "doctor-uid-1",
          email: "dr.dup@example.com",
          name: "Dr. Dup",
          city: "Mumbai",
          consultationModes: ["online"],
        },
      });

      const res = await app.inject({
        method: "POST",
        url: "/doctors",
        payload: {
          firebaseUid: "doctor-uid-2",
          email: "dr.dup@example.com",
          name: "Dr. Dup 2",
          city: "Delhi",
          consultationModes: ["online"],
        },
      });

      expect(res.statusCode).toBe(409);
      expect(res.json().error).toMatch(/already exists/i);
    });

    it("rejects duplicate firebaseUid", async () => {
      await app.inject({
        method: "POST",
        url: "/doctors",
        payload: {
          firebaseUid: "shared-uid",
          email: "a@example.com",
          name: "Dr. A",
          city: "Mumbai",
          consultationModes: ["online"],
        },
      });

      const res = await app.inject({
        method: "POST",
        url: "/doctors",
        payload: {
          firebaseUid: "shared-uid",
          email: "b@example.com",
          name: "Dr. B",
          city: "Delhi",
          consultationModes: ["online"],
        },
      });

      expect(res.statusCode).toBe(409);
      expect(res.json().error).toMatch(/already exists/i);
    });

    it("rejects invalid consultation mode", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/doctors",
        payload: {
          firebaseUid: "invalid-mode-uid",
          email: "invalid@example.com",
          name: "Dr. Invalid",
          city: "Mumbai",
          consultationModes: ["invalid"],
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toMatch(/invalid/i);
    });

    it("rejects offline without clinic address", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/doctors",
        payload: {
          firebaseUid: "offline-uid",
          email: "offline@example.com",
          name: "Dr. Offline",
          city: "Mumbai",
          consultationModes: ["offline"],
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toMatch(/clinic address required/i);
    });

    it("allows offline with clinic address", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/doctors",
        payload: {
          firebaseUid: "offline-with-clinic-uid",
          email: "clinic@example.com",
          name: "Dr. Clinic",
          city: "Mumbai",
          consultationModes: ["offline"],
          clinicAddress: "123 Clinic St, Mumbai",
        },
      });

      expect(res.statusCode).toBe(201);
    });

    it("allows both online and offline with clinic address", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/doctors",
        payload: {
          firebaseUid: "both-uid",
          email: "both@example.com",
          name: "Dr. Both",
          city: "Mumbai",
          consultationModes: ["online", "offline"],
          clinicAddress: "123 Clinic St, Mumbai",
        },
      });

      expect(res.statusCode).toBe(201);
    });
  });

  describe("GET /doctors/:doctorId - Get Doctor Profile", () => {
    let doctorId: string;

    beforeEach(async () => {
      const signupRes = await app.inject({
        method: "POST",
        url: "/doctors",
        payload: {
          firebaseUid: "profile-uid",
          email: "profile@example.com",
          name: "Dr. Profile",
          city: "Mumbai",
          consultationModes: ["online"],
          consultationFeeOnline: 500,
        },
      });
      doctorId = signupRes.json().doctor.id;
    });

    it("returns doctor profile", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/doctors/${doctorId}`,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.doctor).toMatchObject({
        id: doctorId,
        email: "profile@example.com",
        name: "Dr. Profile",
        city: "Mumbai",
      });
      expect(body.education).toEqual([]);
      expect(body.languages).toEqual([]);
      expect(body.availability).toEqual([]);
    });

    it("returns 404 for non-existent doctor", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/doctors/00000000-0000-0000-0000-000000000000",
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error).toMatch(/not found/i);
    });
  });

  describe("PATCH /doctors/:doctorId - Update Profile (Auth Required)", () => {
    let doctorId: string;

    beforeEach(async () => {
      const signupRes = await app.inject({
        method: "POST",
        url: "/doctors",
        payload: {
          firebaseUid: "update-uid",
          email: "update@example.com",
          name: "Dr. Update",
          city: "Mumbai",
          consultationModes: ["online"],
        },
      });
      doctorId = signupRes.json().doctor.id;

      // Approve the doctor for testing
      await testDb.update(doctors).set({ status: "approved" }).where(eq(doctors.id, doctorId));
    });

    it("updates profile fields", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/doctors/${doctorId}`,
        headers: { "x-test-user-id": doctorId }, // Test auth bypass
        payload: { name: "Dr. Updated", city: "Delhi" },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().doctor).toMatchObject({
        name: "Dr. Updated",
        city: "Delhi",
      });
    });

    it("rejects invalid consultation mode", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/doctors/${doctorId}`,
        headers: { "x-test-user-id": doctorId },
        payload: { consultationModes: ["invalid"] },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toMatch(/invalid/i);
    });

    it("rejects offline without clinic address", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/doctors/${doctorId}`,
        headers: { "x-test-user-id": doctorId },
        payload: { consultationModes: ["offline"] },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toMatch(/clinic address required/i);
    });
  });

  describe("Education Routes", () => {
    let doctorId: string;
    let doctorToken: string;

    beforeEach(async () => {
      const signupRes = await app.inject({
        method: "POST",
        url: "/doctors",
        payload: {
          firebaseUid: "edu-uid",
          email: "edu@example.com",
          name: "Dr. Edu",
          city: "Mumbai",
          consultationModes: ["online"],
        },
      });
      doctorId = signupRes.json().doctor.id;

      await testDb.update(doctors).set({ status: "approved" }).where(eq(doctors.id, doctorId));

      const loginRes = await app.inject({
        method: "POST",
        url: "/auth/doctor/login",
        payload: { email: "edu@example.com" },
      });
      doctorToken = loginRes.json().customToken;
    });

    it("adds education entry", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/doctors/${doctorId}/education`,
        headers: { "x-test-user-id": doctorId }, // Test auth bypass
        payload: { degree: "MBBS", institution: "AIIMS", year: 2015 },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().education).toMatchObject({
        degree: "MBBS",
        institution: "AIIMS",
        year: 2015,
      });
    });

    it("rejects for non-existent doctor", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/doctors/00000000-0000-0000-0000-000000000000/education",
        headers: { "x-test-user-id": "test-id" },
        payload: { degree: "MBBS", institution: "AIIMS" },
      });
      expect(res.statusCode).toBe(404);
    });

    it("removes education entry", async () => {
      const addRes = await app.inject({
        method: "POST",
        url: `/doctors/${doctorId}/education`,
        headers: { "x-test-user-id": "test-id" },
        payload: { degree: "MBBS", institution: "AIIMS" },
      });
      const educationId = addRes.json().education.id;

      const res = await app.inject({
        method: "DELETE",
        url: `/doctors/${doctorId}/education/${educationId}`,
        headers: { "x-test-user-id": "test-id" },
      });

      expect(res.statusCode).toBe(204);
    });
  });

  describe("Language Routes", () => {
    let doctorId: string;

    beforeEach(async () => {
      const signupRes = await app.inject({
        method: "POST",
        url: "/doctors",
        payload: {
          firebaseUid: "lang-uid",
          email: "lang@example.com",
          name: "Dr. Lang",
          city: "Mumbai",
          consultationModes: ["online"],
        },
      });
      doctorId = signupRes.json().doctor.id;

      await testDb.update(doctors).set({ status: "approved" }).where(eq(doctors.id, doctorId));
    });

    it("adds language entry", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/doctors/${doctorId}/languages`,
        headers: { "x-test-user-id": "test-id" },
        payload: { language: "Hindi" },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().language.language).toBe("Hindi");
    });

    it("removes language entry", async () => {
      const addRes = await app.inject({
        method: "POST",
        url: `/doctors/${doctorId}/languages`,
        headers: { "x-test-user-id": "test-id" },
        payload: { language: "English" },
      });
      const languageId = addRes.json().language.id;

      const res = await app.inject({
        method: "DELETE",
        url: `/doctors/${doctorId}/languages/${languageId}`,
        headers: { "x-test-user-id": "test-id" },
      });

      expect(res.statusCode).toBe(204);
    });
  });

  describe("Availability Routes", () => {
    let doctorId: string;

    beforeEach(async () => {
      const signupRes = await app.inject({
        method: "POST",
        url: "/doctors",
        payload: {
          firebaseUid: "avail-uid",
          email: "avail@example.com",
          name: "Dr. Avail",
          city: "Mumbai",
          consultationModes: ["online"],
        },
      });
      doctorId = signupRes.json().doctor.id;

      await testDb.update(doctors).set({ status: "approved" }).where(eq(doctors.id, doctorId));
    });

    it("adds availability slot", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/doctors/${doctorId}/availability`,
        headers: { "x-test-user-id": "test-id" },
        payload: { dayOfWeek: 1, startTime: "09:00", endTime: "13:00" },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().availability).toMatchObject({
        dayOfWeek: 1,
        startTime: "09:00",
        endTime: "13:00",
      });
    });

    it("rejects overlapping slot", async () => {
      await app.inject({
        method: "POST",
        url: `/doctors/${doctorId}/availability`,
        headers: { "x-test-user-id": "test-id" },
        payload: { dayOfWeek: 1, startTime: "09:00", endTime: "13:00" },
      });

      const res = await app.inject({
        method: "POST",
        url: `/doctors/${doctorId}/availability`,
        headers: { "x-test-user-id": "test-id" },
        payload: { dayOfWeek: 1, startTime: "10:00", endTime: "14:00" },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toMatch(/overlap/i);
    });

    it("rejects invalid day of week", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/doctors/${doctorId}/availability`,
        headers: { "x-test-user-id": "test-id" },
        payload: { dayOfWeek: 7, startTime: "09:00", endTime: "13:00" },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toMatch(/invalid day/i);
    });

    it("rejects invalid time format", async () => {
      // First add a valid slot
      await app.inject({
        method: "POST",
        url: `/doctors/${doctorId}/availability`,
        headers: { "x-test-user-id": "test-id" },
        payload: { dayOfWeek: 2, startTime: "09:00", endTime: "13:00" }, // Different day to avoid overlap
      });

      // Now test invalid time format (using "25:00" which is invalid hour)
      const res = await app.inject({
        method: "POST",
        url: `/doctors/${doctorId}/availability`,
        headers: { "x-test-user-id": "test-id" },
        payload: { dayOfWeek: 3, startTime: "25:00", endTime: "13:00" }, // Invalid hour "25"
      });
      expect(res.statusCode).toBe(400);
      // Check that the error is related to time format
      expect(res.json().error).toMatch(/invalid time format|invalid time/i);
    });

    it("rejects endTime <= startTime", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/doctors/${doctorId}/availability`,
        headers: { "x-test-user-id": "test-id" },
        payload: { dayOfWeek: 1, startTime: "13:00", endTime: "09:00" },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toMatch(/end time.*after start time/i);
    });

    it("removes availability slot", async () => {
      const addRes = await app.inject({
        method: "POST",
        url: `/doctors/${doctorId}/availability`,
        headers: { "x-test-user-id": "test-id" },
        payload: { dayOfWeek: 1, startTime: "09:00", endTime: "13:00" },
      });
      const availabilityId = addRes.json().availability.id;

      const res = await app.inject({
        method: "DELETE",
        url: `/doctors/${doctorId}/availability/${availabilityId}`,
        headers: { "x-test-user-id": "test-id" },
      });

      expect(res.statusCode).toBe(204);
    });

    it("clears all availability", async () => {
      await app.inject({
        method: "POST",
        url: `/doctors/${doctorId}/availability`,
        headers: { "x-test-user-id": "test-id" },
        payload: { dayOfWeek: 1, startTime: "09:00", endTime: "13:00" },
      });

      const res = await app.inject({
        method: "DELETE",
        url: `/doctors/${doctorId}/availability`,
        headers: { "x-test-user-id": "test-id" },
      });

      expect(res.statusCode).toBe(204);
    });
  });

  describe("GET /doctors/search - Public Search", () => {
    beforeEach(async () => {
      await app.inject({
        method: "POST",
        url: "/doctors",
        payload: {
          firebaseUid: "search-a",
          email: "search-a@example.com",
          name: "Dr. Search A",
          city: "Mumbai",
          consultationModes: ["online"],
        },
      });
      await testDb.update(doctors).set({ status: "approved" }).where(eq(doctors.id, (await testDb.select({id: doctors.id}).from(doctors).where(eq(doctors.email, "search-a@example.com")).limit(1))[0]?.id ?? ""));

      await app.inject({
        method: "POST",
        url: "/doctors",
        payload: {
          firebaseUid: "search-b",
          email: "search-b@example.com",
          name: "Dr. Search B",
          city: "Mumbai",
          consultationModes: ["offline"],
          clinicAddress: "123 Clinic St, Mumbai", // Required for offline mode
        },
      });
      await testDb.update(doctors).set({ status: "approved" }).where(eq(doctors.email, "search-b@example.com"));

      await app.inject({
        method: "POST",
        url: "/doctors",
        payload: {
          firebaseUid: "search-c",
          email: "search-c@example.com",
          name: "Dr. Search C",
          city: "Delhi",
          consultationModes: ["online"],
        },
      });
      await testDb.update(doctors).set({ status: "approved" }).where(eq(doctors.email, "search-c@example.com"));

      await app.inject({
        method: "POST",
        url: "/doctors",
        payload: {
          firebaseUid: "search-d",
          email: "search-d@example.com",
          name: "Dr. Search D",
          city: "Mumbai",
          consultationModes: ["online"],
        },
      });
      // Leave pending
    });

    it("searches approved doctors by city", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/doctors/search?city=Mumbai",
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().doctors).toHaveLength(2);
      expect(res.json().doctors.every((d: any) => d.city === "Mumbai")).toBe(true);
      expect(res.json().doctors.every((d: any) => d.status === "approved")).toBe(true);
    });

    it("searches by consultation mode", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/doctors/search?consultationMode=online",
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().doctors).toHaveLength(2); // search-a and search-c are online and approved
    });

    it("supports pagination", async () => {
      const page1 = await app.inject({
        method: "GET",
        url: "/doctors/search?limit=2&offset=0",
      });
      console.log("page1:", page1.statusCode, page1.payload);
      const page2 = await app.inject({
        method: "GET",
        url: "/doctors/search?limit=2&offset=2",
      });
      console.log("page2:", page2.statusCode, page2.payload);

      expect(page1.json().doctors).toHaveLength(2);
      expect(page2.json().doctors).toHaveLength(1); // 3 approved total
    });
  });

  it("lists doctors by status", async () => {
      // Create test doctors
      await app.inject({
        method: "POST",
        url: "/doctors",
        payload: { firebaseUid: "admin-1", email: "admin1@test.com", name: "Admin 1", city: "Mumbai", consultationModes: ["online"] },
      });
      await app.inject({
        method: "POST",
        url: "/doctors",
        payload: { firebaseUid: "admin-2", email: "admin2@test.com", name: "Admin 2", city: "Mumbai", consultationModes: ["online"] },
      });
      await testDb.update(doctors).set({ status: "approved" }).where(eq(doctors.email, "admin2@test.com"));

      const res = await app.inject({
        method: "GET",
        url: "/admin/doctors?status=pending",
        headers: { "x-test-user-id": platformAdminId, "x-test-user-type": "admin", "x-test-user-role": "platform_admin" }, // Test auth bypass
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().doctors).toHaveLength(1);
    });

    it("approves a doctor", async () => {
      const signupRes = await app.inject({
        method: "POST",
        url: "/doctors",
        payload: { firebaseUid: "approve-uid", email: "approve@test.com", name: "Approve Me", city: "Mumbai", consultationModes: ["online"] },
      });
      const doctorId = signupRes.json().doctor.id;

      const res = await app.inject({
        method: "PATCH",
        url: `/admin/doctors/${doctorId}/approve`,
        headers: { "x-test-user-id": platformAdminId, "x-test-user-type": "admin", "x-test-user-role": "platform_admin" }, // Test auth bypass
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().doctor.status).toBe("approved");
    });

    it("rejects approving non-existent doctor", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/admin/doctors/00000000-0000-0000-0000-000000000000/approve",
        headers: { "x-test-user-id": platformAdminId, "x-test-user-type": "admin", "x-test-user-role": "platform_admin" },
      });

      expect(res.statusCode).toBe(404);
    });

    it("suspends a doctor", async () => {
      const signupRes = await app.inject({
        method: "POST",
        url: "/doctors",
        payload: { firebaseUid: "suspend-uid", email: "suspend@test.com", name: "Suspend Me", city: "Mumbai", consultationModes: ["online"] },
      });
      const doctorId = signupRes.json().doctor.id;
      await testDb.update(doctors).set({ status: "approved" }).where(eq(doctors.id, doctorId));

      const res = await app.inject({
        method: "PATCH",
        url: `/admin/doctors/${doctorId}/suspend`,
        headers: { "x-test-user-id": platformAdminId, "x-test-user-type": "admin", "x-test-user-role": "platform_admin" },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().doctor.status).toBe("suspended");
    });

    it("rejects non-platform admin", async () => {
      // Create a doctor token
      const doctorSignup = await app.inject({
        method: "POST",
        url: "/doctors",
        payload: { firebaseUid: "doc-uid", email: "doc@test.com", name: "Doc", city: "Mumbai", consultationModes: ["online"] },
      });
      await testDb.update(doctors).set({ status: "approved" }).where(eq(doctors.email, "doc@test.com"));

      const doctorLogin = await app.inject({
        method: "POST",
        url: "/auth/doctor/login",
        payload: { email: "doc@test.com" },
      });
      const doctorId = doctorSignup.json().doctor.id;

      const res = await app.inject({
        method: "GET",
        url: "/admin/doctors?status=pending",
        headers: { "x-test-user-id": doctorId, "x-test-user-type": "doctor", "x-test-user-role": "user" },
      });

      expect(res.statusCode).toBe(403); // Doctor cannot access admin routes
    });
  });