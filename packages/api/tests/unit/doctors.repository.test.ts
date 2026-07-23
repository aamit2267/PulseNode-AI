import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeTestDb, testDb, truncateAll } from "../helpers/test-db.js";
import { DoctorsRepository } from "../../src/modules/doctors/doctors.repository.js";
import { eq } from "drizzle-orm";
import { doctors } from "../../src/db/postgres/schema.js";

const doctorsRepo = new DoctorsRepository(testDb);

beforeEach(truncateAll);
afterAll(closeTestDb);

function createDoctor(overrides = {}) {
  return {
    firebaseUid: `firebase-${Date.now()}-${Math.random()}`,
    email: `dr.${Date.now()}@example.com`,
    name: "Dr. Test",
    city: "Mumbai",
    consultationModes: ["online"],
    consultationFeeOnline: 500,
    consultationFeeOffline: 800,
    currency: "INR",
    ...overrides,
  };
}

async function createAndApprove(overrides = {}) {
  const doctor = await doctorsRepo.create(createDoctor(overrides));
  return doctorsRepo.updateStatus(doctor.id, "approved");
}

describe("DoctorsRepository", () => {
  describe("create & find", () => {
    it("creates a doctor with pending status", async () => {
      const doctor = await doctorsRepo.create(createDoctor());
      expect(doctor.id).toBeTruthy();
      expect(doctor.status).toBe("pending");
      expect(doctor.email).toBe(doctor.email.toLowerCase());
    });

    it("finds doctor by ID", async () => {
      const created = await doctorsRepo.create(createDoctor());
      const found = await doctorsRepo.findById(created.id);
      expect(found?.id).toBe(created.id);
      expect(found?.email).toBe(created.email);
    });

    it("finds doctor by email (case insensitive)", async () => {
      await doctorsRepo.create(createDoctor({ email: "Dr.Smith@EXAMPLE.COM" }));
      const found = await doctorsRepo.findByEmail("dr.smith@example.com");
      expect(found).toBeTruthy();
      expect(found?.email).toBe("dr.smith@example.com");
    });

    it("finds doctor by firebaseUid", async () => {
      const firebaseUid = "unique-firebase-uid-123";
      await doctorsRepo.create(createDoctor({ firebaseUid }));
      const found = await doctorsRepo.findByFirebaseUid(firebaseUid);
      expect(found?.firebaseUid).toBe(firebaseUid);
    });

    it("returns undefined for non-existent doctor", async () => {
      const found = await doctorsRepo.findById("00000000-0000-0000-0000-000000000000");
      expect(found).toBeUndefined();
    });
  });

  describe("update", () => {
    it("updates doctor profile fields", async () => {
      const created = await doctorsRepo.create(createDoctor());
      const updated = await doctorsRepo.update(created.id, {
        name: "Dr. Updated",
        city: "Delhi",
        consultationFeeOnline: 600,
      });

      expect(updated?.name).toBe("Dr. Updated");
      expect(updated?.city).toBe("Delhi");
      expect(updated?.consultationFeeOnline).toBe(600);
      expect(updated?.email).toBe(created.email); // unchanged
    });

    it("returns undefined for non-existent doctor", async () => {
      const updated = await doctorsRepo.update("00000000-0000-0000-0000-000000000000", { name: "New" });
      expect(updated).toBeUndefined();
    });
  });

  describe("status management", () => {
    it("updates doctor status", async () => {
      const created = await doctorsRepo.create(createDoctor());
      const approved = await doctorsRepo.updateStatus(created.id, "approved");
      expect(approved?.status).toBe("approved");

      const suspended = await doctorsRepo.updateStatus(created.id, "suspended");
      expect(suspended?.status).toBe("suspended");
    });
  });

  describe("listing", () => {
    beforeEach(async () => {
      await doctorsRepo.create(createDoctor({ email: "a@example.com", city: "Mumbai" }));
      await createAndApprove({ email: "b@example.com", city: "Mumbai" });
      await createAndApprove({ email: "c@example.com", city: "Delhi" });
    });

    it("lists doctors by status", async () => {
      const pending = await doctorsRepo.listByStatus("pending");
      const approved = await doctorsRepo.listByStatus("approved");

      expect(pending).toHaveLength(1);
      expect(approved).toHaveLength(2);
    });

    it("lists approved doctors by city", async () => {
      const mumbai = await doctorsRepo.listApprovedByCity("Mumbai");
      const delhi = await doctorsRepo.listApprovedByCity("Delhi");

      expect(mumbai).toHaveLength(1);
      expect(mumbai[0].city).toBe("Mumbai");
      expect(delhi).toHaveLength(1);
      expect(delhi[0].city).toBe("Delhi");
    });
  });

  describe("education", () => {
    let doctorId: string;

    beforeEach(async () => {
      const doctor = await doctorsRepo.create(createDoctor());
      doctorId = doctor.id;
    });

    it("adds education entries", async () => {
      const edu1 = await doctorsRepo.addEducation({ doctorId, degree: "MBBS", institution: "AIIMS", year: 2015 });
      const edu2 = await doctorsRepo.addEducation({ doctorId, degree: "MD", institution: "PGIMER", year: 2018 });

      expect(edu1.degree).toBe("MBBS");
      expect(edu2.degree).toBe("MD");

      const all = await doctorsRepo.getEducation(doctorId);
      expect(all).toHaveLength(2);
    });

    it("deletes education entry", async () => {
      const edu = await doctorsRepo.addEducation({ doctorId, degree: "MBBS", institution: "AIIMS" });
      await doctorsRepo.deleteEducation(edu.id);

      const all = await doctorsRepo.getEducation(doctorId);
      expect(all).toHaveLength(0);
    });
  });

  describe("languages", () => {
    let doctorId: string;

    beforeEach(async () => {
      const doctor = await doctorsRepo.create(createDoctor());
      doctorId = doctor.id;
    });

    it("adds language entries", async () => {
      await doctorsRepo.addLanguage({ doctorId, language: "Hindi" });
      await doctorsRepo.addLanguage({ doctorId, language: "English" });

      const all = await doctorsRepo.getLanguages(doctorId);
      expect(all).toHaveLength(2);
      expect(all.map((l) => l.language).sort()).toEqual(["English", "Hindi"]);
    });

    it("deletes language entry", async () => {
      const lang = await doctorsRepo.addLanguage({ doctorId, language: "Hindi" });
      await doctorsRepo.deleteLanguage(lang.id);

      const all = await doctorsRepo.getLanguages(doctorId);
      expect(all).toHaveLength(0);
    });
  });

  describe("availability", () => {
    let doctorId: string;

    beforeEach(async () => {
      const doctor = await doctorsRepo.create(createDoctor());
      doctorId = doctor.id;
    });

    it("adds availability slots", async () => {
      await doctorsRepo.addAvailability({ doctorId, dayOfWeek: 1, startTime: "09:00", endTime: "13:00" });
      await doctorsRepo.addAvailability({ doctorId, dayOfWeek: 1, startTime: "14:00", endTime: "18:00" });

      const all = await doctorsRepo.getAvailability(doctorId);
      expect(all).toHaveLength(2);
    });

    it("gets availability by day of week", async () => {
      await doctorsRepo.addAvailability({ doctorId, dayOfWeek: 1, startTime: "09:00", endTime: "13:00" });
      await doctorsRepo.addAvailability({ doctorId, dayOfWeek: 2, startTime: "10:00", endTime: "14:00" });

      const monday = await doctorsRepo.getAvailabilityByDay(doctorId, 1);
      const tuesday = await doctorsRepo.getAvailabilityByDay(doctorId, 2);

      expect(monday).toHaveLength(1);
      expect(tuesday).toHaveLength(1);
    });

    it("deletes availability slot", async () => {
      const slot = await doctorsRepo.addAvailability({ doctorId, dayOfWeek: 1, startTime: "09:00", endTime: "13:00" });
      await doctorsRepo.deleteAvailability(slot.id);

      const all = await doctorsRepo.getAvailability(doctorId);
      expect(all).toHaveLength(0);
    });

    it("clears all availability for doctor", async () => {
      await doctorsRepo.addAvailability({ doctorId, dayOfWeek: 1, startTime: "09:00", endTime: "13:00" });
      await doctorsRepo.addAvailability({ doctorId, dayOfWeek: 2, startTime: "10:00", endTime: "14:00" });

      await doctorsRepo.clearAvailability(doctorId);

      const all = await doctorsRepo.getAvailability(doctorId);
      expect(all).toHaveLength(0);
    });
  });

  describe("full profile", () => {
    it("returns complete doctor profile with relations", async () => {
      const doctor = await doctorsRepo.create(createDoctor());

      await doctorsRepo.addEducation({ doctorId: doctor.id, degree: "MBBS", institution: "AIIMS" });
      await doctorsRepo.addLanguage({ doctorId: doctor.id, language: "Hindi" });
      await doctorsRepo.addAvailability({ doctorId: doctor.id, dayOfWeek: 1, startTime: "09:00", endTime: "13:00" });

      const profile = await doctorsRepo.getFullProfile(doctor.id);

      expect(profile).toBeTruthy();
      expect(profile?.doctor.id).toBe(doctor.id);
      expect(profile?.education).toHaveLength(1);
      expect(profile?.languages).toHaveLength(1);
      expect(profile?.availability).toHaveLength(1);
    });

    it("returns undefined for non-existent doctor", async () => {
      const profile = await doctorsRepo.getFullProfile("00000000-0000-0000-0000-000000000000");
      expect(profile).toBeUndefined();
    });
  });

  describe("search", () => {
    beforeEach(async () => {
      await doctorsRepo.create(createDoctor({ email: "a@example.com", city: "Mumbai", consultationModes: ["online"], status: "pending" }));
      await createAndApprove({ email: "b@example.com", city: "Mumbai", consultationModes: ["offline"] });
      await createAndApprove({ email: "c@example.com", city: "Delhi", consultationModes: ["online"] });
      await createAndApprove({ email: "d@example.com", city: "Mumbai", consultationModes: ["online"] });
    });

    it("searches approved doctors by city", async () => {
      const results = await doctorsRepo.searchApproved({ city: "Mumbai", limit: 10, offset: 0 });
      expect(results).toHaveLength(2);
      expect(results.every((d) => d.city === "Mumbai")).toBe(true);
      expect(results.every((d) => d.status === "approved")).toBe(true);
    });

    it("searches by consultation mode", async () => {
      const results = await doctorsRepo.searchApproved({ consultationMode: "online", limit: 10, offset: 0 });
      expect(results).toHaveLength(2); // c and d are online and approved
    });

    it("supports pagination", async () => {
      const page1 = await doctorsRepo.searchApproved({ limit: 2, offset: 0 });
      const page2 = await doctorsRepo.searchApproved({ limit: 2, offset: 2 });

      expect(page1).toHaveLength(2);
      expect(page2).toHaveLength(1); // 3 approved total
    });

    it("returns empty array for non-matching city", async () => {
      const results = await doctorsRepo.searchApproved({ city: "Bangalore", limit: 10, offset: 0 });
      expect(results).toHaveLength(0);
    });
  });

  describe("count", () => {
    beforeEach(async () => {
      await doctorsRepo.create(createDoctor({ email: "a@example.com", city: "Mumbai", consultationModes: ["online"] }));
      await createAndApprove({ email: "b@example.com", city: "Mumbai", consultationModes: ["offline"] });
      await createAndApprove({ email: "c@example.com", city: "Delhi", consultationModes: ["online"] });
    });

    it("counts approved doctors by city", async () => {
      const count = await doctorsRepo.countApproved({ city: "Mumbai" });
      expect(count).toBe(1); // only b is approved and in Mumbai
    });

    it("counts approved doctors by consultation mode", async () => {
      const count = await doctorsRepo.countApproved({ consultationMode: "online" });
      expect(count).toBe(1); // only c is online and approved
    });
  });
});