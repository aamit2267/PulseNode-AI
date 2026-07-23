import Fastify, { type FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import type { Db } from "./db/postgres/client.js";
import { logger } from "./lib/logger.js";
import { registerAuthMiddleware } from "./modules/auth/auth.middleware.js";
import { AuthRepository } from "./modules/auth/auth.repository.js";
import { FirebaseAuthClient } from "./modules/auth/firebase-client.js";
import { TotpService } from "./modules/auth/totp.service.js";
import { AuthService } from "./modules/auth/auth.service.js";
import { AuthController } from "./modules/auth/auth.controller.js";
import { registerAuthRoutes } from "./modules/auth/auth.routes.js";
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
import { DoctorsRepository } from "./modules/doctors/doctors.repository.js";
import { DoctorsService } from "./modules/doctors/doctors.service.js";
import { DoctorsController } from "./modules/doctors/doctors.controller.js";
import { registerDoctorsRoutes } from "./modules/doctors/doctors.routes.js";

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
    req.log.error({ err, url: req.url, message: err.message, stack: err.stack }, "unhandled route error");
    const status = (err as any).statusCode && (err as any).statusCode >= 400 ? (err as any).statusCode : 500;
    reply
      .code(status)
      .send({ error: status === 500 ? "Internal server error" : (err as any).message });
  });

  // Register auth middleware
  registerAuthMiddleware(app);

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

  // Auth module
  const authRepo = new AuthRepository(db);
  const firebaseAuth = new FirebaseAuthClient();
  const totpService = new TotpService(authRepo);
  const authService = new AuthService(authRepo, firebaseAuth, totpService);
  const authController = new AuthController(authService);

  // Doctors module
  const doctorsRepo = new DoctorsRepository(db);
  const doctorsService = new DoctorsService(doctorsRepo);
  const doctorsController = new DoctorsController(doctorsService);

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
  registerAuthRoutes(app, authController);
  registerDoctorsRoutes(app, doctorsController);

  return app;
}
