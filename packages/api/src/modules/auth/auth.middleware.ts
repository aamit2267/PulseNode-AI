import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { logger } from "../../lib/logger.js";
import { firebaseAuthClient } from "./firebase-client.js";

/**
 * Middleware to verify Firebase ID token from Authorization header
 * Attaches decoded user info to request.user
 */
export async function authMiddleware(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  // Test bypass: if x-test-user-id is set in headers, use that for testing
  const testUserId = req.headers["x-test-user-id"];
  const testUserType = req.headers["x-test-user-type"] as string || "doctor";
  const testUserRole = req.headers["x-test-user-role"] as string || "user";

  if (testUserId && process.env.NODE_ENV === "test") {
    (req as any).user = {
      uid: testUserId,
      email: "test@example.com",
      claims: {
        "https://pulsenode.ai/user_type": testUserType,
        role: testUserRole,
      },
    };
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return reply.code(401).send({ error: "Missing or invalid Authorization header" });
  }

  const idToken = authHeader.slice(7); // Remove "Bearer "

  try {
    const decoded = await firebaseAuthClient.verifyIdToken(idToken);
    // Attach user info to request
    (req as any).user = {
      uid: decoded.uid,
      email: decoded.email,
      claims: decoded,
    };
  } catch (error) {
    logger.warn({ err: error }, "Invalid ID token");
    return reply.code(401).send({ error: "Invalid or expired token" });
  }
}

/**
 * Optional auth - doesn't fail if no token, just attaches user if valid
 */
export async function optionalAuthMiddleware(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return; // No token, continue without user
  }

  const idToken = authHeader.slice(7);
  try {
    const decoded = await firebaseAuthClient.verifyIdToken(idToken);
    (req as any).user = {
      uid: decoded.uid,
      email: decoded.email,
      claims: decoded,
    };
  } catch {
    // Invalid token, continue without user
  }
}

/**
 * Role-based access control middleware
 * Checks custom claims for user type and role
 */
export function requireUserType(...allowedTypes: string[]) {
  return async function (
    req: FastifyRequest,
    reply: FastifyReply,
  ) {
    const user = (req as any).user;
    if (!user) {
      return reply.code(401).send({ error: "Authentication required" });
    }

    const userType = user.claims?.["https://pulsenode.ai/user_type"] as string;
    if (!userType || !allowedTypes.includes(userType)) {
      return reply.code(403).send({ error: "Insufficient permissions" });
    }
  };
}

export function requireRole(...allowedRoles: string[]) {
  return async function (
    req: FastifyRequest,
    reply: FastifyReply,
  ) {
    const user = (req as any).user;
    if (!user) {
      return reply.code(401).send({ error: "Authentication required" });
    }

    const role = user.claims?.role as string;
    if (!role || !allowedRoles.includes(role)) {
      return reply.code(403).send({ error: "Insufficient permissions" });
    }
  };
}

export function registerAuthMiddleware(app: FastifyInstance) {
  // Using any to avoid complex generic type issues
  (app as any).decorate("authenticate", authMiddleware);
  (app as any).decorate("optionalAuthenticate", optionalAuthMiddleware);
  (app as any).decorate("requireUserType", requireUserType);
  (app as any).decorate("requireRole", requireRole);
}