import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { logger } from "../../lib/logger.js";
import type { AuthService } from "./auth.service.js";
import type { EmployeeAuthResult, DoctorAuthResult, AdminAuthResult, TotpSetupResult } from "./auth.service.js";

const emailSchema = z.string().email().toLowerCase();
const totpCodeSchema = z.string().length(6).regex(/^\d+$/);

const employeeLoginSchema = z.object({
  email: emailSchema,
  totpCode: totpCodeSchema.optional(),
});

const doctorLoginSchema = z.object({
  email: emailSchema,
  totpCode: totpCodeSchema.optional(),
});

const adminLoginSchema = z.object({
  email: emailSchema,
  totpCode: totpCodeSchema.optional(),
});

const totpVerifySchema = z.object({
  totpCode: totpCodeSchema,
});

const doctorSignupSchema = z.object({
  firebaseUid: z.string().min(1),
  email: emailSchema,
  name: z.string().min(1).max(200),
  photoUrl: z.string().url().optional(),
  city: z.string().min(1).max(100),
  consultationModes: z.array(z.enum(["online", "offline", "both"])).min(1),
  clinicAddress: z.string().optional(),
  consultationFeeOnline: z.number().int().positive().optional(),
  consultationFeeOffline: z.number().int().positive().optional(),
  currency: z.string().length(3).default("INR"),
});

const createCompanyAdminSchema = z.object({
  firebaseUid: z.string().min(1),
  email: emailSchema,
  name: z.string().min(1).max(200),
  companyId: z.string().uuid(),
});

const createPlatformAdminSchema = z.object({
  firebaseUid: z.string().min(1),
  email: emailSchema,
  name: z.string().min(1).max(200),
});

export class AuthController {
  constructor(private readonly service: AuthService) {}

  // ============================================================
  // EMPLOYEE AUTH
  // ============================================================

  async employeeLogin(
    req: FastifyRequest,
    reply: FastifyReply,
  ) {
    const parsed = employeeLoginSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "Invalid request", details: parsed.error.issues });
    }

    const { email, totpCode } = parsed.data;

    try {
      const result = await this.service.employeeLogin(email, totpCode);

      if (result.type === "success") {
        logger.info({ employeeId: result.data.employee.id }, "Employee login successful");
        return reply.send({
          customToken: result.data.customToken,
          user: {
            id: result.data.employee.id,
            email: result.data.employee.corporateEmail,
            name: result.data.employee.name,
            userType: "employee",
            companyId: result.data.employee.companyId,
          },
          requiresTotp: result.data.requiresTotp,
        });
      }

      if (result.type === "totp_required") {
        return reply.code(200).send({
          requiresTotp: true,
          setup: result.setup,
          message: result.message,
        });
      }

      return reply.code(401).send({ error: result.message });
    } catch (error) {
      logger.error({ email, err: error, message: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined }, "Employee login error");
      return reply.code(500).send({ error: "Internal server error", details: error instanceof Error ? error.message : String(error) });
    }
  }

  async employeeTotpSetup(
    req: FastifyRequest,
    reply: FastifyReply,
  ) {
    const schema = z.object({ email: emailSchema });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid email" });
    }

    // Find employee to get ID
    const employee = await this.service["repo"].findEmployeeByEmail(parsed.data.email);
    if (!employee) {
      return reply.code(404).send({ error: "Employee not found" });
    }

    const setup = await this.service.employeeTotpSetup(employee.id);
    return reply.send(setup);
  }

  async employeeTotpVerify(
    req: FastifyRequest,
    reply: FastifyReply,
  ) {
    const parsed = totpVerifySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid TOTP code" });
    }

    const params = req.params as { employeeId: string };
    const result = await this.service.employeeTotpVerify(params.employeeId, parsed.data.totpCode);
    return reply.send(result);
  }

  // ============================================================
  // DOCTOR AUTH
  // ============================================================

  async doctorSignup(
    req: FastifyRequest,
    reply: FastifyReply,
  ) {
    const parsed = doctorSignupSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "Invalid doctor signup data", details: parsed.error.issues });
    }

    try {
      const doctor = await this.service.doctorSignup(parsed.data);
      return reply.code(201).send({
        doctor: {
          id: doctor.id,
          firebaseUid: doctor.firebaseUid,
          email: doctor.email,
          name: doctor.name,
          status: doctor.status,
        },
        message: "Doctor registered successfully. Account pending platform admin approval.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Signup failed";
      return reply.code(409).send({ error: message });
    }
  }

  async doctorLogin(
    req: FastifyRequest,
    reply: FastifyReply,
  ) {
    const parsed = doctorLoginSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "Invalid request", details: parsed.error.issues });
    }

    const { email, totpCode } = parsed.data;
    const result = await this.service.doctorLogin(email, totpCode);

    if (result.type === "success") {
      logger.info({ doctorId: result.data.doctor.id }, "Doctor login successful");
      return reply.send({
        customToken: result.data.customToken,
        user: {
          id: result.data.doctor.id,
          email: result.data.doctor.email,
          name: result.data.doctor.name,
          userType: "doctor",
          status: result.data.doctor.status,
          city: result.data.doctor.city,
        },
        requiresTotp: result.data.requiresTotp,
      });
    }

    if (result.type === "totp_required") {
      return reply.code(200).send({
        requiresTotp: true,
        setup: result.setup,
        message: result.message,
      });
    }

    if (result.type === "pending_approval") {
      return reply.code(403).send({ error: result.message });
    }

    return reply.code(401).send({ error: result.message });
  }

  async doctorTotpSetup(
    req: FastifyRequest,
    reply: FastifyReply,
  ) {
    const params = req.params as { doctorId: string };
    const setup = await this.service.doctorTotpSetup(params.doctorId);
    return reply.send(setup);
  }

  async doctorTotpVerify(
    req: FastifyRequest,
    reply: FastifyReply,
  ) {
    const parsed = totpVerifySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid TOTP code" });
    }

    const params = req.params as { doctorId: string };
    const result = await this.service.doctorTotpVerify(params.doctorId, parsed.data.totpCode);
    return reply.send(result);
  }

  // ============================================================
  // ADMIN AUTH
  // ============================================================

  async adminLogin(
    req: FastifyRequest,
    reply: FastifyReply,
  ) {
    const parsed = adminLoginSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "Invalid request", details: parsed.error.issues });
    }

    const { email, totpCode } = parsed.data;
    const result = await this.service.adminLogin(email, totpCode);

    if (result.type === "success") {
      logger.info({ adminId: result.data.admin.id, role: result.data.admin.role }, "Admin login successful");
      return reply.send({
        customToken: result.data.customToken,
        user: {
          id: result.data.admin.id,
          email: result.data.admin.email,
          name: result.data.admin.name,
          userType: "admin",
          role: result.data.admin.role,
          companyId: result.data.admin.companyId,
        },
        requiresTotp: result.data.requiresTotp,
      });
    }

    if (result.type === "totp_required") {
      return reply.code(200).send({
        requiresTotp: true,
        setup: result.setup,
        message: result.message,
      });
    }

    return reply.code(401).send({ error: result.message });
  }

  async adminTotpSetup(
    req: FastifyRequest,
    reply: FastifyReply,
  ) {
    const params = req.params as { adminId: string };
    const setup = await this.service.adminTotpSetup(params.adminId);
    return reply.send(setup);
  }

  async adminTotpVerify(
    req: FastifyRequest,
    reply: FastifyReply,
  ) {
    const parsed = totpVerifySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid TOTP code" });
    }

    const params = req.params as { adminId: string };
    const result = await this.service.adminTotpVerify(params.adminId, parsed.data.totpCode);
    return reply.send(result);
  }

  // Platform admin endpoints for creating admin users
  async createCompanyAdmin(
    req: FastifyRequest,
    reply: FastifyReply,
  ) {
    const parsed = createCompanyAdminSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid input", details: parsed.error.issues });
    }

    try {
      const admin = await this.service.createCompanyAdmin(parsed.data);
      return reply.code(201).send({ admin });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create admin";
      return reply.code(409).send({ error: message });
    }
  }

  async createPlatformAdmin(
    req: FastifyRequest,
    reply: FastifyReply,
  ) {
    const parsed = createPlatformAdminSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid input", details: parsed.error.issues });
    }

    try {
      const admin = await this.service.createPlatformAdmin(parsed.data);
      return reply.code(201).send({ admin });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create admin";
      return reply.code(409).send({ error: message });
    }
  }
}