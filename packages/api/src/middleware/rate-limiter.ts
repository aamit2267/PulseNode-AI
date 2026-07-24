import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { logger } from "../lib/logger.js";

// In-memory store for rate limiting (use Redis in production)
interface RateLimitStore {
  [key: string]: {
    count: number;
    resetAt: number;
  };
}

const store: RateLimitStore = {};
const CLEANUP_INTERVAL = 60 * 1000; // 1 minute

// Clean up expired entries periodically
setInterval(() => {
  const now = Date.now();
  for (const key of Object.keys(store)) {
    if (store[key].resetAt < now) {
      delete store[key];
    }
  }
}, CLEANUP_INTERVAL);

interface RateLimitOptions {
  maxRequests: number;
  windowMs: number;
  keyGenerator?: (req: FastifyRequest) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  message?: string;
}

export function createRateLimiter(options: RateLimitOptions) {
  const {
    maxRequests,
    windowMs,
    keyGenerator = (req: FastifyRequest) => req.ip || "unknown",
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
    message = "Too many requests, please try again later",
  } = options;

  return async function rateLimiter(req: FastifyRequest, reply: FastifyReply) {
    const key = keyGenerator(req);
    const now = Date.now();
    const windowStart = now - windowMs;

    // Get or create entry
    let entry = store[key];
    if (!entry || entry.resetAt < now) {
      entry = { count: 0, resetAt: now + windowMs };
      store[key] = entry;
    }

    // Check if request should be counted
    const shouldCount = !(
      (skipSuccessfulRequests && reply.statusCode < 400) ||
      (skipFailedRequests && reply.statusCode >= 400)
    );

    if (shouldCount) {
      entry.count++;
    }

    // Set rate limit headers
    reply.header("X-RateLimit-Limit", maxRequests);
    reply.header("X-RateLimit-Remaining", Math.max(0, maxRequests - entry.count));
    reply.header("X-RateLimit-Reset", Math.ceil(entry.resetAt / 1000));

    if (entry.count > maxRequests) {
      logger.warn({ ip: req.ip, key, count: entry.count, maxRequests }, "Rate limit exceeded");
      return reply.code(429).send({ error: message });
    }
  };
}

// Pre-configured rate limiters for auth endpoints
export const authRateLimiter = createRateLimiter({
  maxRequests: 5,
  windowMs: 15 * 60 * 1000, // 15 minutes
  keyGenerator: (req: FastifyRequest) => `auth:${req.ip}:${req.body?.email || "unknown"}`,
  message: "Too many authentication attempts, please try again later",
});

export const totpRateLimiter = createRateLimiter({
  maxRequests: 10,
  windowMs: 15 * 60 * 1000, // 15 minutes
  keyGenerator: (req: FastifyRequest) => `totp:${req.ip}:${req.params?.employeeId || req.params?.doctorId || req.params?.adminId || "unknown"}`,
  message: "Too many TOTP attempts, please try again later",
});

export const adminRateLimiter = createRateLimiter({
  maxRequests: 20,
  windowMs: 15 * 60 * 1000, // 15 minutes
  keyGenerator: (req: FastifyRequest) => `admin:${req.ip}`,
  message: "Too many admin requests, please try again later",
});

export function registerRateLimiters(app: FastifyInstance) {
  app.decorate("authRateLimiter", authRateLimiter);
  app.decorate("totpRateLimiter", totpRateLimiter);
  app.decorate("adminRateLimiter", adminRateLimiter);
}