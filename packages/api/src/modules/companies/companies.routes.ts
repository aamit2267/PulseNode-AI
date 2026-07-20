import type { FastifyInstance } from "fastify";
import type { CompaniesController } from "./companies.controller.js";

export function registerCompaniesRoutes(
  app: FastifyInstance,
  controller: CompaniesController,
) {
  app.post("/companies", (req, reply) => controller.create(req, reply));
  app.get<{ Params: { id: string } }>("/companies/:id", (req, reply) =>
    controller.getById(req, reply),
  );
}
