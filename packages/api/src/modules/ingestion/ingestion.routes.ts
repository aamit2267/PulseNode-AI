import type { FastifyInstance } from "fastify";
import type { IngestionController } from "./ingestion.controller.js";

export function registerIngestionRoutes(
  app: FastifyInstance,
  controller: IngestionController,
) {
  app.post<{ Params: { companyId: string } }>(
    "/companies/:companyId/employees/ingest",
    (req, reply) => controller.bulkUpload(req, reply),
  );
}
