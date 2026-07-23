import { logger } from "../../lib/logger.js";
import type { DoctorsRepository } from "./doctors.repository.js";
import type { Doctor, NewDoctor, DoctorUpdate, DoctorEducation, NewDoctorEducation, DoctorLanguage, NewDoctorLanguage, DoctorAvailability, NewDoctorAvailability } from "./doctors.repository.js";

export interface DoctorProfileResponse {
  doctor: Doctor;
  education: DoctorEducation[];
  languages: DoctorLanguage[];
  availability: DoctorAvailability[];
}

export interface CreateDoctorInput {
  firebaseUid: string;
  email: string;
  name: string;
  photoUrl?: string;
  city: string;
  consultationModes: string[];
  clinicAddress?: string;
  consultationFeeOnline?: number;
  consultationFeeOffline?: number;
  currency: string;
}

export interface UpdateDoctorProfileInput {
  name?: string;
  photoUrl?: string;
  city?: string;
  consultationModes?: string[];
  clinicAddress?: string;
  consultationFeeOnline?: number;
  consultationFeeOffline?: number;
  currency?: string;
}

export interface AddEducationInput {
  doctorId: string;
  degree: string;
  institution: string;
  year?: number;
}

export interface AddLanguageInput {
  doctorId: string;
  language: string;
}

export interface AddAvailabilityInput {
  doctorId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

export class DoctorsService {
  constructor(private readonly repo: DoctorsRepository) {}

  // ==================== DOCTOR PROFILE ====================

  async createDoctor(input: CreateDoctorInput): Promise<Doctor> {
    // Validate consultation modes
    const validModes = ["online", "offline", "both"];
    if (!input.consultationModes.every((m) => validModes.includes(m))) {
      throw new Error("Invalid consultation mode");
    }

    // If offline mode, clinic address is required
    if (
      (input.consultationModes.includes("offline") || input.consultationModes.includes("both")) &&
      !input.clinicAddress
    ) {
      throw new Error("Clinic address required for offline consultations");
    }

    // Check for existing doctor with same email or firebaseUid
    const existingByEmail = await this.repo.findByEmail(input.email);
    if (existingByEmail) {
      throw new Error("Doctor with this email already exists");
    }

    const existingByFirebase = await this.repo.findByFirebaseUid(input.firebaseUid);
    if (existingByFirebase) {
      throw new Error("Doctor with this Firebase account already exists");
    }

    const doctor = await this.repo.create({
      ...input,
      email: input.email.toLowerCase(),
    });

    logger.info({ doctorId: doctor.id, email: doctor.email }, "Doctor created - pending approval");
    return doctor;
  }

  async getDoctorProfile(doctorId: string): Promise<DoctorProfileResponse | undefined> {
    return this.repo.getFullProfile(doctorId);
  }

  async updateDoctorProfile(doctorId: string, input: UpdateDoctorProfileInput): Promise<Doctor | undefined> {
    const existing = await this.repo.findById(doctorId);
    if (!existing) {
      throw new Error("Doctor not found");
    }

    // Validate consultation modes if provided
    if (input.consultationModes) {
      const validModes = ["online", "offline", "both"];
      if (!input.consultationModes.every((m) => validModes.includes(m))) {
        throw new Error("Invalid consultation mode");
      }

      // If offline mode, clinic address required
      if (
        (input.consultationModes.includes("offline") || input.consultationModes.includes("both")) &&
        !input.clinicAddress &&
        !existing.clinicAddress
      ) {
        throw new Error("Clinic address required for offline consultations");
      }
    }

    const updated = await this.repo.update(doctorId, input);
    logger.info({ doctorId, changes: Object.keys(input) }, "Doctor profile updated");
    return updated;
  }

  // ==================== ADMIN APPROVAL ====================

  async approveDoctor(doctorId: string): Promise<Doctor | undefined> {
    const doctor = await this.repo.findById(doctorId);
    if (!doctor) {
      throw new Error("Doctor not found");
    }

    if (doctor.status === "approved") {
      throw new Error("Doctor already approved");
    }

    const updated = await this.repo.updateStatus(doctorId, "approved");
    logger.info({ doctorId }, "Doctor approved");
    return updated;
  }

  async suspendDoctor(doctorId: string): Promise<Doctor | undefined> {
    const doctor = await this.repo.findById(doctorId);
    if (!doctor) {
      throw new Error("Doctor not found");
    }

    const updated = await this.repo.updateStatus(doctorId, "suspended");
    logger.info({ doctorId }, "Doctor suspended");
    return updated;
  }

  async listPendingDoctors(): Promise<Doctor[]> {
    return this.repo.listByStatus("pending");
  }

  async listApprovedDoctors(): Promise<Doctor[]> {
    return this.repo.listByStatus("approved");
  }

  // ==================== EDUCATION ====================

  async addEducation(input: AddEducationInput): Promise<DoctorEducation> {
    const doctor = await this.repo.findById(input.doctorId);
    if (!doctor) {
      throw new Error("Doctor not found");
    }

    const education = await this.repo.addEducation({
      doctorId: input.doctorId,
      degree: input.degree,
      institution: input.institution,
      year: input.year,
    });

    logger.info({ doctorId: input.doctorId, educationId: education.id }, "Education added");
    return education;
  }

  async removeEducation(educationId: string): Promise<void> {
    await this.repo.deleteEducation(educationId);
    logger.info({ educationId }, "Education removed");
  }

  // ==================== LANGUAGES ====================

  async addLanguage(input: AddLanguageInput): Promise<DoctorLanguage> {
    const doctor = await this.repo.findById(input.doctorId);
    if (!doctor) {
      throw new Error("Doctor not found");
    }

    const language = await this.repo.addLanguage({
      doctorId: input.doctorId,
      language: input.language,
    });

    logger.info({ doctorId: input.doctorId, languageId: language.id }, "Language added");
    return language;
  }

  async removeLanguage(languageId: string): Promise<void> {
    await this.repo.deleteLanguage(languageId);
    logger.info({ languageId }, "Language removed");
  }

  // ==================== AVAILABILITY ====================

  async addAvailability(input: AddAvailabilityInput): Promise<DoctorAvailability> {
    const doctor = await this.repo.findById(input.doctorId);
    if (!doctor) {
      throw new Error("Doctor not found");
    }

    // Validate day of week
    if (input.dayOfWeek < 0 || input.dayOfWeek > 6) {
      throw new Error("Invalid day of week (0-6)");
    }

    // Validate time format (HH:mm)
    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(input.startTime) || !timeRegex.test(input.endTime)) {
      throw new Error("Invalid time format (HH:mm)");
    }

    // Validate endTime > startTime
    const start = new Date(`1970-01-01T${input.startTime}:00`);
    const end = new Date(`1970-01-01T${input.endTime}:00`);
    if (end <= start) {
      throw new Error("End time must be after start time");
    }

    // Check for overlapping availability
    const existing = await this.repo.getAvailabilityByDay(input.doctorId, input.dayOfWeek);
    for (const slot of existing) {
      if (
        (input.startTime >= slot.startTime && input.startTime < slot.endTime) ||
        (input.endTime > slot.startTime && input.endTime <= slot.endTime) ||
        (input.startTime <= slot.startTime && input.endTime >= slot.endTime)
      ) {
        throw new Error("Availability overlaps with existing slot");
      }
    }

    const availability = await this.repo.addAvailability({
      doctorId: input.doctorId,
      dayOfWeek: input.dayOfWeek,
      startTime: input.startTime,
      endTime: input.endTime,
    });

    logger.info({ doctorId: input.doctorId, availabilityId: availability.id }, "Availability added");
    return availability;
  }

  async removeAvailability(availabilityId: string): Promise<void> {
    await this.repo.deleteAvailability(availabilityId);
    logger.info({ availabilityId }, "Availability removed");
  }

  async clearAvailability(doctorId: string): Promise<void> {
    await this.repo.clearAvailability(doctorId);
    logger.info({ doctorId }, "All availability cleared");
  }

  // ==================== SEARCH ====================

  async searchDoctors(filters: {
    city?: string;
    consultationMode?: string;
    specialty?: string;
    language?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ doctors: Doctor[]; total: number }> {
    const [doctors, total] = await Promise.all([
      this.repo.searchApproved(filters),
      this.repo.countApproved(filters),
    ]);

    return { doctors, total };
  }
}