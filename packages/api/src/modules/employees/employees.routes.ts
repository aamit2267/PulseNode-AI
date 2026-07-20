import type { FastifyInstance } from "fastify";
import type { EmployeesController } from "./employees.controller.js";

export function registerEmployeesRoutes(
  app: FastifyInstance,
  controller: EmployeesController,
) {
  app.get<{ Params: { companyId: string } }>(
    "/companies/:companyId/employees",
    (req, reply) => controller.listByCompany(req, reply),
  );
  app.post<{ Params: { companyId: string } }>(
    "/companies/:companyId/employees",
    (req, reply) => controller.manualAdd(req, reply),
  );
}
