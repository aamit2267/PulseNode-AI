import type { FastifyInstance } from "fastify";
import type { DoctorsController } from "./doctors.controller.js";

export function registerDoctorsRoutes(
  app: FastifyInstance,
  controller: DoctorsController,
) {
  // Doctor profile routes
  app.post("/doctors", (req, reply) => controller.createDoctor(req, reply));
  app.get<{ Params: { doctorId: string } }>(
    "/doctors/:doctorId",
    (req, reply) => controller.getDoctorById(req, reply),
  );
  app.get<{ Params: { doctorId: string } }>(
    "/doctors/:doctorId/profile",
    { preHandler: [app.authenticate] }, // Doctor can only view their own profile
    (req, reply) => controller.getMyProfile(req, reply),
  );
  app.patch<{ Params: { doctorId: string } }>(
    "/doctors/:doctorId",
    { preHandler: [app.authenticate] },
    (req, reply) => controller.updateMyProfile(req, reply),
  );

  // Education routes
  app.post("/doctors/:doctorId/education", { preHandler: [app.authenticate] }, (req, reply) =>
    controller.addEducation(req, reply),
  );
  app.delete<{ Params: { doctorId: string; educationId: string } }>(
    "/doctors/:doctorId/education/:educationId",
    { preHandler: [app.authenticate] },
    (req, reply) => controller.removeEducation(req, reply),
  );

  // Language routes
  app.post("/doctors/:doctorId/languages", { preHandler: [app.authenticate] }, (req, reply) =>
    controller.addLanguage(req, reply),
  );
  app.delete<{ Params: { doctorId: string; languageId: string } }>(
    "/doctors/:doctorId/languages/:languageId",
    { preHandler: [app.authenticate] },
    (req, reply) => controller.removeLanguage(req, reply),
  );

  // Availability routes
  app.post("/doctors/:doctorId/availability", { preHandler: [app.authenticate] }, (req, reply) =>
    controller.addAvailability(req, reply),
  );
  app.delete<{ Params: { doctorId: string; availabilityId: string } }>(
    "/doctors/:doctorId/availability/:availabilityId",
    { preHandler: [app.authenticate] },
    (req, reply) => controller.removeAvailability(req, reply),
  );
  app.delete<{ Params: { doctorId: string } }>(
    "/doctors/:doctorId/availability",
    { preHandler: [app.authenticate] },
    (req, reply) => controller.clearAvailability(req, reply),
  );

  // Search routes (public - no auth required for patients to search)
  app.get("/doctors/search", (req, reply) => controller.searchDoctors(req, reply));

  // Admin routes - platform admin only
  app.get<{ Querystring: { status?: string } }>(
    "/admin/doctors",
    { preHandler: [app.authenticate, app.requireUserType("admin"), app.requireRole("platform_admin")] },
    (req, reply) => controller.listDoctorsByStatus(req, reply),
  );
  app.patch<{ Params: { doctorId: string } }>(
    "/admin/doctors/:doctorId/approve",
    { preHandler: [app.authenticate, app.requireUserType("admin"), app.requireRole("platform_admin")] },
    (req, reply) => controller.approveDoctor(req, reply),
  );
  app.patch<{ Params: { doctorId: string } }>(
    "/admin/doctors/:doctorId/suspend",
    { preHandler: [app.authenticate, app.requireUserType("admin"), app.requireRole("platform_admin")] },
    (req, reply) => controller.suspendDoctor(req, reply),
  );
}