import type { FastifyInstance } from "fastify";
import type { AuthController } from "./auth.controller.js";

export function registerAuthRoutes(
  app: FastifyInstance,
  controller: AuthController,
) {
  // Employee auth routes
  app.post("/auth/employee/login", (req, reply) =>
    controller.employeeLogin(req as any, reply),
  );
  app.post("/auth/employee/totp/setup", (req, reply) =>
    controller.employeeTotpSetup(req as any, reply),
  );
  app.post<{ Params: { employeeId: string } }>(
    "/auth/employee/:employeeId/totp/verify",
    (req, reply) => controller.employeeTotpVerify(req as any, reply),
  );

  // Doctor auth routes
  app.post("/auth/doctor/signup", (req, reply) =>
    controller.doctorSignup(req as any, reply),
  );
  app.post("/auth/doctor/login", (req, reply) =>
    controller.doctorLogin(req as any, reply),
  );
  app.post<{ Params: { doctorId: string } }>(
    "/auth/doctor/:doctorId/totp/setup",
    (req, reply) => controller.doctorTotpSetup(req as any, reply),
  );
  app.post<{ Params: { doctorId: string } }>(
    "/auth/doctor/:doctorId/totp/verify",
    (req, reply) => controller.doctorTotpVerify(req as any, reply),
  );

  // Admin auth routes
  app.post("/auth/admin/login", (req, reply) =>
    controller.adminLogin(req as any, reply),
  );
  app.post<{ Params: { adminId: string } }>(
    "/auth/admin/:adminId/totp/setup",
    (req, reply) => controller.adminTotpSetup(req as any, reply),
  );
  app.post<{ Params: { adminId: string } }>(
    "/auth/admin/:adminId/totp/verify",
    (req, reply) => controller.adminTotpVerify(req as any, reply),
  );

  // Platform admin only - create admin users
  app.post("/auth/admin/create-company-admin", (req, reply) =>
    controller.createCompanyAdmin(req as any, reply),
  );
  app.post("/auth/admin/create-platform-admin", (req, reply) =>
    controller.createPlatformAdmin(req as any, reply),
  );
}