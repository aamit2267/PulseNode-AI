import Fastify, { type FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import type { Db } from "./db/postgres/client.js";
import { logger } from "./lib/logger.js";
import { CompaniesRepository } from "./modules/companies/companies.repository.js";
import { CompaniesController } from "./modules/companies/companies.controller.js";
import { registerCompaniesRoutes } from "./modules/companies/companies.routes.js";
import { CompanyMaintainersRepository } from "./modules/companies/company-maintainers.repository.js";
import { CompanyMaintainersController } from "./modules/companies/company-maintainers.controller.js";
import { registerCompanyMaintainersRoutes } from "./modules/companies/company-maintainers.routes.js";
import { PoliciesRepository } from "./modules/policies/policies.repository.js";
import { PoliciesController } from "./modules/policies/policies.controller.js";
import { registerPoliciesRoutes } from "./modules/policies/policies.routes.js";
import { EmployeesRepository } from "./modules/employees/employees.repository.js";
import { EmployeesController } from "./modules/employees/employees.controller.js";
import { registerEmployeesRoutes } from "./modules/employees/employees.routes.js";
import { IngestionRepository } from "./modules/ingestion/ingestion.repository.js";
import { EmployeeIngestionService } from "./modules/ingestion/ingestion.service.js";
import { IngestionController } from "./modules/ingestion/ingestion.controller.js";
import { registerIngestionRoutes } from "./modules/ingestion/ingestion.routes.js";

export interface AppOptions {
  db: Db;
}

export async function buildApp({ db }: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({ loggerInstance: logger });

  await app.register(multipart, {
    limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  });

  // Client-agnostic error shape: always structured JSON, never HTML.
  app.setErrorHandler((err, req, reply) => {
    req.log.error({ err, url: req.url }, "unhandled route error");
    const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
    reply
      .code(status)
      .send({ error: status === 500 ? "Internal server error" : err.message });
  });

  const companiesRepo = new CompaniesRepository(db);
  const companyMaintainersRepo = new CompanyMaintainersRepository(db);
  const policiesRepo = new PoliciesRepository(db);
  const employeesRepo = new EmployeesRepository(db);
  const ingestionRepo = new IngestionRepository(db);
  const ingestionService = new EmployeeIngestionService(
    employeesRepo,
    policiesRepo,
    ingestionRepo,
  );

  registerCompaniesRoutes(app, new CompaniesController(companiesRepo));
  registerCompanyMaintainersRoutes(
    app,
    new CompanyMaintainersController(companyMaintainersRepo, companiesRepo),
  );
  registerPoliciesRoutes(app, new PoliciesController(policiesRepo));
  registerEmployeesRoutes(
    app,
    new EmployeesController(employeesRepo, ingestionService),
  );
  registerIngestionRoutes(app, new IngestionController(ingestionService));

  return app;
}
