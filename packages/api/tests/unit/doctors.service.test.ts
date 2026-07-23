import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DoctorsService } from "../../src/modules/doctors/doctors.service.js";
import type { DoctorsRepository } from "../../src/modules/doctors/doctors.repository.js";
import type { Doctor, DoctorEducation, DoctorLanguage, DoctorAvailability } from "../../src/modules/doctors/doctors.repository.js";

const mockRepo: Partial<DoctorsRepository> = {
  create: vi.fn(),
  findById: vi.fn(),
  findByEmail: vi.fn(),
  findByFirebaseUid: vi.fn(),
  update: vi.fn(),
  updateStatus: vi.fn(),
  listByStatus: vi.fn(),
  listApprovedByCity: vi.fn(),
  addEducation: vi.fn(),
  getEducation: vi.fn(),
  deleteEducation: vi.fn(),
  addLanguage: vi.fn(),
  getLanguages: vi.fn(),
  deleteLanguage: vi.fn(),
  addAvailability: vi.fn(),
  getAvailability: vi.fn(),
  getAvailabilityByDay: vi.fn(),
  deleteAvailability: vi.fn(),
  clearAvailability: vi.fn(),
  getFullProfile: vi.fn(),
  searchApproved: vi.fn(),
  countApproved: vi.fn(),
};

const service = new DoctorsService(mockRepo as DoctorsRepository);

function createDoctor(overrides = {}) {
  return {
    id: "doc-123",
    firebaseUid: "firebase-uid-123",
    email: "dr.test@example.com",
    name: "Dr. Test",
    photoUrl: null,
    city: "Mumbai",
    consultationModes: ["online"],
    clinicAddress: "123 Clinic St, Mumbai",
    consultationFeeOnline: 500,
    consultationFeeOffline: 800,
    currency: "INR",
    status: "pending",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createEducation(overrides = {}): DoctorEducation {
  return {
    id: "edu-123",
    doctorId: "doc-123",
    degree: "MBBS",
    institution: "AIIMS",
    year: 2015,
    createdAt: new Date(),
    ...overrides,
  };
}

function createLanguage(overrides = {}): DoctorLanguage {
  return {
    id: "lang-123",
    doctorId: "doc-123",
    language: "Hindi",
    createdAt: new Date(),
    ...overrides,
  };
}

function createAvailability(overrides = {}): DoctorAvailability {
  return {
    id: "avail-123",
    doctorId: "doc-123",
    dayOfWeek: 1,
    startTime: "09:00",
    endTime: "13:00",
    createdAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe("DoctorsService", () => {
  describe("createDoctor", () => {
    it("creates a doctor with pending status", async () => {
      const input = {
        firebaseUid: "firebase-new-123",
        email: "new@example.com",
        name: "Dr. New",
        city: "Mumbai",
        consultationModes: ["online"],
        consultationFeeOnline: 500,
        currency: "INR",
      };

      mockRepo.findByEmail.mockResolvedValue(undefined);
      mockRepo.findByFirebaseUid.mockResolvedValue(undefined);
      mockRepo.create.mockImplementation((data) => createDoctor({
        email: data.email,
        firebaseUid: data.firebaseUid,
        name: data.name,
        status: "pending"
      }));

      const result = await service.createDoctor(input);

      expect(result).toMatchObject({
        firebaseUid: "firebase-new-123",
        email: "new@example.com",
        name: "Dr. New",
        status: "pending",
      });
      expect(mockRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        firebaseUid: "firebase-new-123",
        email: "new@example.com",
        name: "Dr. New",
        city: "Mumbai",
        consultationModes: ["online"],
        consultationFeeOnline: 500,
        currency: "INR",
      }));
    });

    it("throws for duplicate email", async () => {
      mockRepo.findByEmail.mockResolvedValue(createDoctor());

      await expect(service.createDoctor({
        firebaseUid: "new-uid",
        email: "existing@example.com",
        name: "Dr. New",
        city: "Mumbai",
        consultationModes: ["online"],
      })).rejects.toThrow("already exists");
    });

    it("throws for duplicate firebaseUid", async () => {
      mockRepo.findByFirebaseUid.mockResolvedValue(createDoctor());

      await expect(service.createDoctor({
        firebaseUid: "existing-uid",
        email: "new@example.com",
        name: "Dr. New",
        city: "Mumbai",
        consultationModes: ["online"],
      })).rejects.toThrow("already exists");
    });

    it("throws for invalid consultation mode", async () => {
      await expect(service.createDoctor({
        firebaseUid: "uid",
        email: "new@example.com",
        name: "Dr. New",
        city: "Mumbai",
        consultationModes: ["invalid"],
      })).rejects.toThrow("Invalid consultation mode");
    });

    it("throws for offline without clinic address", async () => {
      await expect(service.createDoctor({
        firebaseUid: "uid",
        email: "new@example.com",
        name: "Dr. New",
        city: "Mumbai",
        consultationModes: ["offline"],
      })).rejects.toThrow("Clinic address required");
    });

    it("allows offline with clinic address", async () => {
      mockRepo.create.mockResolvedValue(createDoctor());
      mockRepo.findByEmail.mockResolvedValue(undefined);
      mockRepo.findByFirebaseUid.mockResolvedValue(undefined);

      const result = await service.createDoctor({
        firebaseUid: "uid",
        email: "new@example.com",
        name: "Dr. New",
        city: "Mumbai",
        consultationModes: ["offline"],
        clinicAddress: "123 Clinic St",
      });

      expect(result).toBeDefined();
    });

    it("allows both online and offline with clinic address", async () => {
      mockRepo.create.mockResolvedValue(createDoctor());
      mockRepo.findByEmail.mockResolvedValue(undefined);
      mockRepo.findByFirebaseUid.mockResolvedValue(undefined);

      const result = await service.createDoctor({
        firebaseUid: "uid",
        email: "new@example.com",
        name: "Dr. New",
        city: "Mumbai",
        consultationModes: ["online", "offline"],
        clinicAddress: "123 Clinic St",
      });

      expect(result).toBeDefined();
    });
  });

  describe("getDoctorProfile", () => {
    it("returns full profile with relations", async () => {
      const doctor = createDoctor({ id: "doc-123" });
      const education = [{ id: "edu-1", doctorId: "doc-123", degree: "MBBS", institution: "AIIMS", year: 2015, createdAt: new Date() }];
      const languages = [{ id: "lang-1", doctorId: "doc-123", language: "Hindi", createdAt: new Date() }];
      const availability = [{ id: "avail-1", doctorId: "doc-123", dayOfWeek: 1, startTime: "09:00", endTime: "13:00", createdAt: new Date() }];

      mockRepo.getFullProfile.mockResolvedValue({
        doctor,
        education,
        languages,
        availability,
      });

      const result = await service.getDoctorProfile("doc-123");

      expect(result).toEqual({
        doctor,
        education,
        languages,
        availability,
      });
    });

    it("returns undefined for non-existent doctor", async () => {
      mockRepo.getFullProfile.mockResolvedValue(undefined);

      const result = await service.getDoctorProfile("non-existent");
      expect(result).toBeUndefined();
    });
  });

  describe("updateDoctorProfile", () => {
    it("updates profile fields", async () => {
      const existingDoctor = createDoctor({ id: "doc-123" });
      mockRepo.findById.mockResolvedValue(existingDoctor);
      mockRepo.update.mockResolvedValue(createDoctor({ name: "Dr. Updated", city: "Delhi" }));

      const result = await service.updateDoctorProfile("doc-123", { name: "Dr. Updated", city: "Delhi" });

      expect(result?.name).toBe("Dr. Updated");
      expect(result?.city).toBe("Delhi");
      expect(mockRepo.update).toHaveBeenCalledWith("doc-123", { name: "Dr. Updated", city: "Delhi" });
    });

    it("throws for non-existent doctor", async () => {
      mockRepo.findById.mockResolvedValue(undefined);

      await expect(service.updateDoctorProfile("non-existent", { name: "New" }))
        .rejects.toThrow("Doctor not found");
    });

    it("throws for invalid consultation mode", async () => {
      mockRepo.findById.mockResolvedValue(createDoctor());

      await expect(service.updateDoctorProfile("doc-123", { consultationModes: ["invalid"] }))
        .rejects.toThrow("Invalid consultation mode");
    });

    it("throws for offline without clinic address", async () => {
      mockRepo.findById.mockResolvedValue(createDoctor({ consultationModes: ["online"], clinicAddress: null }));

      await expect(service.updateDoctorProfile("doc-123", { consultationModes: ["offline"] }))
        .rejects.toThrow("Clinic address required");
    });
  });

  describe("admin approval", () => {
    it("approves a pending doctor", async () => {
      mockRepo.findById.mockResolvedValue(createDoctor({ status: "pending" }));
      mockRepo.updateStatus.mockResolvedValue(createDoctor({ status: "approved" }));

      const result = await service.approveDoctor("doc-123");

      expect(result?.status).toBe("approved");
      expect(mockRepo.updateStatus).toHaveBeenCalledWith("doc-123", "approved");
    });

    it("throws for non-existent doctor", async () => {
      mockRepo.findById.mockResolvedValue(undefined);

      await expect(service.approveDoctor("non-existent")).rejects.toThrow("Doctor not found");
    });

    it("throws for already approved doctor", async () => {
      mockRepo.findById.mockResolvedValue(createDoctor({ status: "approved" }));

      await expect(service.approveDoctor("doc-123")).rejects.toThrow("already approved");
    });

    it("suspends a doctor", async () => {
      mockRepo.findById.mockResolvedValue(createDoctor({ status: "approved" }));
      mockRepo.updateStatus.mockResolvedValue(createDoctor({ status: "suspended" }));

      const result = await service.suspendDoctor("doc-123");

      expect(result?.status).toBe("suspended");
      expect(mockRepo.updateStatus).toHaveBeenCalledWith("doc-123", "suspended");
    });
  });

  describe("education", () => {
    it("adds education entry", async () => {
      mockRepo.findById.mockResolvedValue(createDoctor({ id: "doc-123" }));
      mockRepo.addEducation.mockResolvedValue({
        id: "edu-123",
        doctorId: "doc-123",
        degree: "MBBS",
        institution: "AIIMS",
        year: 2015,
        createdAt: new Date(),
      });

      const result = await service.addEducation({ doctorId: "doc-123", degree: "MBBS", institution: "AIIMS" });

      expect(result.degree).toBe("MBBS");
      expect(result.institution).toBe("AIIMS");
    });

    it("throws for non-existent doctor", async () => {
      mockRepo.findById.mockResolvedValue(undefined);

      await expect(service.addEducation({ doctorId: "non-existent", degree: "MBBS", institution: "AIIMS" }))
        .rejects.toThrow("Doctor not found");
    });
  });

  describe("languages", () => {
    it("adds language entry", async () => {
      mockRepo.findById.mockResolvedValue(createDoctor({ id: "doc-123" }));
      mockRepo.addLanguage.mockResolvedValue({
        id: "lang-123",
        doctorId: "doc-123",
        language: "Hindi",
        createdAt: new Date(),
      });

      const result = await service.addLanguage({ doctorId: "doc-123", language: "Hindi" });

      expect(result.language).toBe("Hindi");
    });
  });

  describe("availability", () => {
    it("adds availability slot", async () => {
      mockRepo.findById.mockResolvedValue(createDoctor({ id: "doc-123" }));
      mockRepo.getAvailabilityByDay.mockResolvedValue([]);
      mockRepo.addAvailability.mockResolvedValue({
        id: "avail-123",
        doctorId: "doc-123",
        dayOfWeek: 1,
        startTime: "09:00",
        endTime: "13:00",
        createdAt: new Date(),
      });

      const result = await service.addAvailability({
        doctorId: "doc-123",
        dayOfWeek: 1,
        startTime: "09:00",
        endTime: "13:00",
      });

      expect(result.dayOfWeek).toBe(1);
      expect(result.startTime).toBe("09:00");
    });

    it("throws for invalid day of week", async () => {
      mockRepo.findById.mockResolvedValue(createDoctor());

      await expect(service.addAvailability({
        doctorId: "doc-123",
        dayOfWeek: 7,
        startTime: "09:00",
        endTime: "13:00",
      })).rejects.toThrow("Invalid day of week");
    });

    it("throws for invalid time format", async () => {
      mockRepo.findById.mockResolvedValue(createDoctor());

      await expect(service.addAvailability({
        doctorId: "doc-123",
        dayOfWeek: 1,
        startTime: "9:00am",
        endTime: "13:00",
      })).rejects.toThrow("Invalid time format");
    });

    it("throws for overlapping availability", async () => {
      mockRepo.findById.mockResolvedValue(createDoctor());
      mockRepo.getAvailabilityByDay.mockResolvedValue([
        { startTime: "09:00", endTime: "13:00" },
      ]);

      await expect(service.addAvailability({
        doctorId: "doc-123",
        dayOfWeek: 1,
        startTime: "10:00",
        endTime: "14:00",
      })).rejects.toThrow("overlaps");
    });

    it("throws for endTime <= startTime", async () => {
      mockRepo.findById.mockResolvedValue(createDoctor());
      mockRepo.getAvailabilityByDay.mockResolvedValue([]);

      await expect(service.addAvailability({
        doctorId: "doc-123",
        dayOfWeek: 1,
        startTime: "13:00",
        endTime: "09:00",
      })).rejects.toThrow("End time must be after start time");
    });
  });

  describe("searchDoctors", () => {
    it("searches with filters and pagination", async () => {
      const doctors = [createDoctor({ id: "1" }), createDoctor({ id: "2" })];
      mockRepo.searchApproved.mockResolvedValue(doctors);
      mockRepo.countApproved.mockResolvedValue(2);

      const result = await service.searchDoctors({
        city: "Mumbai",
        consultationMode: "online",
        limit: 20,
        offset: 0,
      });

      expect(result.doctors).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(mockRepo.searchApproved).toHaveBeenCalledWith(expect.objectContaining({
        city: "Mumbai",
        consultationMode: "online",
        limit: 20,
        offset: 0,
      }));
    });
  });
});