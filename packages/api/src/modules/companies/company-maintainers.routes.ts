import type { FastifyInstance } from "fastify";
import type { CompanyMaintainersController } from "./company-maintainers.controller.js";

export function registerCompanyMaintainersRoutes(
  app: FastifyInstance,
  controller: CompanyMaintainersController,
) {
  app.post<{ Params: { companyId: string } }>(
    "/companies/:companyId/maintainers",
    (req, reply) => controller.addMaintainer(req, reply),
  );

  app.get<{ Params: { companyId: string } }>(
    "/companies/:companyId/maintainers",
    (req, reply) => controller.listMaintainers(req, reply),
  );

  app.patch<{ Params: { companyId: string; maintainerId: string } }>(
    "/companies/:companyId/maintainers/:maintainerId",
    (req, reply) => controller.updateMaintainer(req, reply),
  );

  app.delete<{ Params: { companyId: string; maintainerId: string } }>(
    "/companies/:companyId/maintainers/:maintainerId",
    (req, reply) => controller.removeMaintainer(req, reply),
  );
}