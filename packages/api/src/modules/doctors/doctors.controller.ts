import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { logger } from "../../lib/logger.js";
import type { DoctorsService } from "./doctors.service.js";
import type { DoctorProfileResponse, CreateDoctorInput, UpdateDoctorProfileInput, AddEducationInput, AddLanguageInput, AddAvailabilityInput } from "./doctors.service.js";

const createDoctorSchema = z.object({
  firebaseUid: z.string().min(1),
  email: z.string().email().toLowerCase(),
  name: z.string().min(1).max(200),
  photoUrl: z.string().url().optional(),
  city: z.string().min(1).max(100),
  consultationModes: z.array(z.enum(["online", "offline", "both"])).min(1),
  clinicAddress: z.string().optional(),
  consultationFeeOnline: z.number().int().positive().optional(),
  consultationFeeOffline: z.number().int().positive().optional(),
  currency: z.string().length(3).default("INR"),
});

const updateDoctorSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  photoUrl: z.string().url().optional(),
  city: z.string().min(1).max(100).optional(),
  consultationModes: z.array(z.enum(["online", "offline", "both"])).min(1).optional(),
  clinicAddress: z.string().optional(),
  consultationFeeOnline: z.number().int().positive().optional(),
  consultationFeeOffline: z.number().int().positive().optional(),
  currency: z.string().length(3).optional(),
});

const addEducationSchema = z.object({
  degree: z.string().min(1).max(100),
  institution: z.string().min(1).max(200),
  year: z.number().int().min(1950).max(new Date().getFullYear()).optional(),
});

const addLanguageSchema = z.object({
  language: z.string().min(1).max(50),
});

const addAvailabilitySchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6, "Invalid day of week (0-6)"),
  startTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, "Invalid time format (HH:mm)"),
  endTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, "Invalid time format (HH:mm)"),
}).refine((data) => {
  const start = new Date(`1970-01-01T${data.startTime}:00`);
  const end = new Date(`1970-01-01T${data.endTime}:00`);
  return end > start;
}, { message: "End time must be after start time", path: ["endTime"] });

const searchFiltersSchema = z.object({
  city: z.string().optional(),
  consultationMode: z.enum(["online", "offline"]).optional(),
  specialty: z.string().optional(),
  language: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export class DoctorsController {
  constructor(private readonly service: DoctorsService) {}

  // ==================== DOCTOR PROFILE ====================

  async createDoctor(
    req: FastifyRequest<{ Body: z.infer<typeof createDoctorSchema> }>,
    reply: FastifyReply,
  ) {
    const parsed = createDoctorSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "Invalid doctor data", details: parsed.error.issues });
    }

    try {
      const doctor = await this.service.createDoctor(parsed.data);
      return reply.code(201).send({
        doctor: {
          id: doctor.id,
          firebaseUid: doctor.firebaseUid,
          email: doctor.email,
          name: doctor.name,
          city: doctor.city,
          status: doctor.status,
        },
        message: "Doctor registered successfully. Account pending platform admin approval.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Signup failed";
      // Validation errors should return 400, conflicts return 409
      const isValidationError = message.includes("Invalid") || message.includes("required");
      return reply.code(isValidationError ? 400 : 409).send({ error: message });
    }
  }

  async getMyProfile(
    req: FastifyRequest<{ Params: { doctorId: string } }>,
    reply: FastifyReply,
  ) {
    // In production, doctorId comes from authenticated user
    const doctorId = req.params.doctorId;

    const profile = await this.service.getDoctorProfile(doctorId);
    if (!profile) {
      return reply.code(404).send({ error: "Doctor not found" });
    }

    return reply.send(profile);
  }

  async updateMyProfile(
    req: FastifyRequest<{ Params: { doctorId: string }; Body: z.infer<typeof updateDoctorSchema> }>,
    reply: FastifyReply,
  ) {
    const parsed = updateDoctorSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "Invalid update data", details: parsed.error.issues });
    }

    const doctorId = req.params.doctorId;

    try {
      const updated = await this.service.updateDoctorProfile(doctorId, parsed.data);
      if (!updated) {
        return reply.code(404).send({ error: "Doctor not found" });
      }
      return reply.send({ doctor: updated });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Update failed";
      return reply.code(400).send({ error: message });
    }
  }

  async getDoctorById(
    req: FastifyRequest<{ Params: { doctorId: string } }>,
    reply: FastifyReply,
  ) {
    const profile = await this.service.getDoctorProfile(req.params.doctorId);
    if (!profile) {
      return reply.code(404).send({ error: "Doctor not found" });
    }
    return reply.send(profile);
  }

  // ==================== EDUCATION ====================

  async addEducation(
    req: FastifyRequest<{ Body: z.infer<typeof addEducationSchema>; Params: { doctorId: string } }>,
    reply: FastifyReply,
  ) {
    const parsed = addEducationSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "Invalid education data", details: parsed.error.issues });
    }

    try {
      const education = await this.service.addEducation({
        ...parsed.data,
        doctorId: req.params.doctorId,
      });
      return reply.code(201).send({ education });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to add education";
      const isNotFound = message.includes("not found");
      return reply.code(isNotFound ? 404 : 400).send({ error: message });
    }
  }

  async removeEducation(
    req: FastifyRequest<{ Params: { educationId: string } }>,
    reply: FastifyReply,
  ) {
    try {
      await this.service.removeEducation(req.params.educationId);
      return reply.code(204).send();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to remove education";
      return reply.code(400).send({ error: message });
    }
  }

  // ==================== LANGUAGES ====================

  async addLanguage(
    req: FastifyRequest<{ Body: z.infer<typeof addLanguageSchema>; Params: { doctorId: string } }>,
    reply: FastifyReply,
  ) {
    const parsed = addLanguageSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "Invalid language data", details: parsed.error.issues });
    }

    try {
      const language = await this.service.addLanguage({
        ...parsed.data,
        doctorId: req.params.doctorId,
      });
      return reply.code(201).send({ language });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to add language";
      const isNotFound = message.includes("not found");
      return reply.code(isNotFound ? 404 : 400).send({ error: message });
    }
  }

  async removeLanguage(
    req: FastifyRequest<{ Params: { languageId: string } }>,
    reply: FastifyReply,
  ) {
    try {
      await this.service.removeLanguage(req.params.languageId);
      return reply.code(204).send();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to remove language";
      return reply.code(400).send({ error: message });
    }
  }

  // ==================== AVAILABILITY ====================

  async addAvailability(
    req: FastifyRequest<{ Body: z.infer<typeof addAvailabilitySchema>; Params: { doctorId: string } }>,
    reply: FastifyReply,
  ) {
    const parsed = addAvailabilitySchema.safeParse(req.body);
    if (!parsed.success) {
      // Extract proper error messages from Zod validation errors
      const issues = parsed.error.issues;
      const messages = issues.map((issue) => issue.message).join(", ");
      return reply
        .code(400)
        .send({ error: messages || "Invalid availability data", details: issues });
    }

    try {
      const availability = await this.service.addAvailability({
        ...parsed.data,
        doctorId: req.params.doctorId,
      });
      return reply.code(201).send({ availability });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to add availability";
      return reply.code(400).send({ error: message });
    }
  }

  async removeAvailability(
    req: FastifyRequest<{ Params: { availabilityId: string } }>,
    reply: FastifyReply,
  ) {
    try {
      await this.service.removeAvailability(req.params.availabilityId);
      return reply.code(204).send();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to remove availability";
      return reply.code(400).send({ error: message });
    }
  }

  async clearAvailability(
    req: FastifyRequest<{ Params: { doctorId: string } }>,
    reply: FastifyReply,
  ) {
    try {
      await this.service.clearAvailability(req.params.doctorId);
      return reply.code(204).send();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to clear availability";
      return reply.code(400).send({ error: message });
    }
  }

  // ==================== SEARCH ====================

  async searchDoctors(
    req: FastifyRequest<{ Querystring: z.infer<typeof searchFiltersSchema> }>,
    reply: FastifyReply,
  ) {
    const parsed = searchFiltersSchema.safeParse(req.query);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "Invalid search filters", details: parsed.error.issues });
    }

    const result = await this.service.searchDoctors(parsed.data);
    return reply.send(result);
  }

  // ==================== ADMIN ====================

  async listDoctorsByStatus(
    req: FastifyRequest<{ Querystring: { status?: string } }>,
    reply: FastifyReply,
  ) {
    const status = (req.query.status as "pending" | "approved" | "suspended") || "pending";

    const doctors = await this.service["repo"].listByStatus(status);
    return reply.send({ doctors });
  }

  async approveDoctor(
    req: FastifyRequest<{ Params: { doctorId: string } }>,
    reply: FastifyReply,
  ) {
    try {
      const doctor = await this.service.approveDoctor(req.params.doctorId);
      if (!doctor) {
        return reply.code(404).send({ error: "Doctor not found" });
      }
      return reply.send({ doctor, message: "Doctor approved" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Approval failed";
      return reply.code(400).send({ error: message });
    }
  }

  async suspendDoctor(
    req: FastifyRequest<{ Params: { doctorId: string } }>,
    reply: FastifyReply,
  ) {
    try {
      const doctor = await this.service.suspendDoctor(req.params.doctorId);
      if (!doctor) {
        return reply.code(404).send({ error: "Doctor not found" });
      }
      return reply.send({ doctor, message: "Doctor suspended" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Suspension failed";
      return reply.code(400).send({ error: message });
    }
  }
}