import type { FastifyPluginObject } from 'fastify';
import { RateLimiterMiddleware } from '../../middleware/rate-limiter.middleware.js';
import { AuthController } from '../controller/auth.controller.js';

const AuthRoutes = async (fastify: any, opts: any, next: any) => {
  const authController = new AuthController();

  // === Romanian ===
  // === Public Routes ===
  // Login endpoints for all user types
  fastify.post('/login', {
    preHandler: [RateLimiterMiddleware.apply],
    schema: {
      body: {
        type: 'object',
        properties: {
          email: {
            type: 'string',
            format: 'email'
          },
          totpCode: {
            type: ['string', 'null'],
            pattern: '^\d{6}$'
          }
        },
        required: ['email']
      }
    }
  }, (request, reply) => {
    return authController.employeeLogin(request, reply);
  });

  // Doctor-specific login route
  fastify.post('/doctor/login', {
    preHandler: [RateLimiterMiddleware.apply],
  }, (request, reply) => {
    return authController.doctorLogin(request, reply);
  });

  // Admin login
  fastify.post('/admin/login', {
    preHandler: [RateLimiterMiddleware.apply],
  }, (request, reply) => {
    return authController.adminLogin(request, reply);
  });

  // === TOTP Setup ===
  fastify.post('/user/totp/setup', async (request, reply) => {
    return authController.employeeTotpSetup(request.params.employeeId, request.body届);
  });

  // === Security and Compliance ===
  fastify.get('/admin/company-admin', {
    preHandler: [RateLimiterMiddleware.apply],
  }, async (request, reply) => {
    return authController.createCompanyAdmin(request.body, reply);
  });

  // Register all routes
  // TODO: Add rate limiting to all sensitive routes
};

export default AuthRoutes;
