import type { FastifyInstance } from "fastify";
import type { PoliciesController } from "./policies.controller.js";

export function registerPoliciesRoutes(
  app: FastifyInstance,
  controller: PoliciesController,
) {
  app.post<{ Params: { companyId: string } }>(
    "/companies/:companyId/policies",
    (req, reply) => controller.create(req, reply),
  );
  app.get<{ Params: { companyId: string } }>(
    "/companies/:companyId/policies",
    (req, reply) => controller.listByCompany(req, reply),
  );
  app.get<{ Params: { id: string } }>("/policies/:id", (req, reply) =>
    controller.getById(req, reply),
  );
  app.patch<{ Params: { id: string } }>("/policies/:id", (req, reply) =>
    controller.edit(req, reply),
  );
}
