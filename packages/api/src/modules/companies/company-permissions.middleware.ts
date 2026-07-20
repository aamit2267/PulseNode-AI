import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { CompanyMaintainersRepository } from "./company-maintainers.repository.js";
import type { MaintainerRole } from "./company-maintainers.repository.js";

export function createPermissionMiddleware(
  repo: CompanyMaintainersRepository,
  requiredRole: MaintainerRole,
) {
  return async function permissionMiddleware(
    req: FastifyRequest,
    reply: FastifyReply,
  ) {
    const user = (req as any).user;
    if (!user?.email) {
      return reply.code(401).send({ error: "Unauthorized" });
    }

    // Get companyId from params (assuming it's in the route params)
    const companyId = (req.params as any).companyId;
    if (!companyId) {
      return reply.code(400).send({ error: "Company ID required" });
    }

    const hasPermission = await repo.hasPermission(companyId, user.email, requiredRole);
    if (!hasPermission) {
      const roleNames: Record<MaintainerRole, string> = {
        "read-only": "read-only access",
        maintainer: "maintainer (read-write) access",
        admin: "admin access",
      };
      return reply
        .code(403)
        .send({ error: `Requires ${roleNames[requiredRole]} or higher` });
    }
  };
}

/**
 * Helper to register employee routes with proper permissions
 */
export function registerEmployeeRoutesWithPermissions(
  app: FastifyInstance,
  repo: CompanyMaintainersRepository,
  employeesController: any,
  ingestionController: any,
) {
  // Read-only endpoints (read-only, maintainer, admin)
  app.get<{ Params: { companyId: string } }>(
    "/companies/:companyId/employees",
    { preHandler: [app.authenticate, createPermissionMiddleware(repo, "read-only")] },
    (req, reply) => employeesController.listByCompany(req, reply),
  );

  // Write endpoints (maintainer, admin)
  app.post<{ Params: { companyId: string } }>(
    "/companies/:companyId/employees",
    { preHandler: [app.authenticate, createPermissionMiddleware(repo, "maintainer")] },
    (req, reply) => employeesController.manualAdd(req, reply),
  );

  // Bulk ingestion (maintainer, admin)
  app.post<{ Params: { companyId: string } }>(
    "/companies/:companyId/employees/ingest",
    { preHandler: [app.authenticate, createPermissionMiddleware(repo, "maintainer")] },
    (req, reply) => ingestionController.bulkUpload(req, reply),
  );
}

/**
 * Decorate the fastify instance with permission helpers
 */
export function registerCompanyPermissions(app: FastifyInstance, repo: CompanyMaintainersRepository) {
  app.decorate("requirePermission", (role: MaintainerRole) =>
    createPermissionMiddleware(repo, role),
  );
}