import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { logger } from "../lib/logger.js";

/**
 * Middleware to verify doctor owns the resource
 * Must be used after authenticate middleware
 */
export async function requireDoctorOwnership(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  const user = (req as any).user;
  if (!user) {
    return reply.code(401).send({ error: "Authentication required" });
  }

  // Check if user is a doctor
  const userType = user.claims?.["https://pulsenode.ai/user_type"] as string;
  if (userType !== "doctor") {
    return reply.code(403).send({ error: "Doctor access required" });
  }

  // Get doctorId from params
  const doctorId = (req.params as any)?.doctorId;
  if (!doctorId) {
    return reply.code(400).send({ error: "Doctor ID required" });
  }

  // Verify ownership
  if (user.uid !== doctorId) {
    logger.warn({ userId: user.uid, requestedDoctorId: doctorId }, "Doctor ownership check failed");
    return reply.code(403).send({ error: "Access denied: can only access own resources" });
  }
}

/**
 * Middleware to verify company admin owns the company
 * Must be used after authenticate middleware
 */
export async function requireCompanyAdminOwnership(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  const user = (req as any).user;
  if (!user) {
    return reply.code(401).send({ error: "Authentication required" });
  }

  const userType = user.claims?.["https://pulsenode.ai/user_type"] as string;
  if (userType !== "admin") {
    return reply.code(403).send({ error: "Admin access required" });
  }

  const role = user.claims?.role as string;
  if (role !== "company_admin") {
    return reply.code(403).send({ error: "Company admin access required" });
  }

  // Get companyId from params
  const companyId = (req.params as any)?.companyId;
  if (!companyId) {
    return reply.code(400).send({ error: "Company ID required" });
  }

  // Verify ownership
  const userCompanyId = user.claims?.companyId as string;
  if (userCompanyId !== companyId) {
    logger.warn({ userId: user.uid, userCompanyId, requestedCompanyId: companyId }, "Company admin ownership check failed");
    return reply.code(403).send({ error: "Access denied: can only access own company" });
  }
}

/**
 * Middleware to verify platform admin
 */
export async function requirePlatformAdmin(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  const user = (req as any).user;
  if (!user) {
    return reply.code(401).send({ error: "Authentication required" });
  }

  const userType = user.claims?.["https://pulsenode.ai/user_type"] as string;
  if (userType !== "admin") {
    return reply.code(403).send({ error: "Admin access required" });
  }

  const role = user.claims?.role as string;
  if (role !== "platform_admin") {
    return reply.code(403).send({ error: "Platform admin access required" });
  }
}

export function registerOwnershipMiddlewares(app: FastifyInstance) {
  app.decorate("requireDoctorOwnership", requireDoctorOwnership);
  app.decorate("requireCompanyAdminOwnership", requireCompanyAdminOwnership);
  app.decorate("requirePlatformAdmin", requirePlatformAdmin);
}