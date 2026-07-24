import type { FastifyInstance } from "fastify";
import type { BenefitsController } from "./benefits.controller.js";

export function registerBenefitsRoutes(
  app: FastifyInstance,
  controller: BenefitsController,
) {
  // Employee wallet endpoints
  app.get("/benefits/wallet", { preHandler: [app.authenticate] }, (req, reply) =>
    controller.getMyWalletBalance(req, reply)
  );
  app.get("/benefits/wallet/transactions", { preHandler: [app.authenticate] }, (req, reply) =>
    controller.getMyTransactionHistory(req, reply)
  );
  app.post("/benefits/wallet/topup", { preHandler: [app.authenticate] }, (req, reply) =>
    controller.initiateTopup(req, reply)
  );
  app.post("/benefits/wallet/topup/callback", (req, reply) =>
    controller.handleTopupCallback(req, reply)
  );

  // Company admin endpoints
  app.get("/companies/:companyId/benefits/policies", { preHandler: [app.authenticate, app.requireUserType("admin"), app.requireRole("company_admin")] }, (req, reply) =>
    controller.getCompanyPolicies(req, reply)
  );
  app.post("/companies/:companyId/benefits/policies", { preHandler: [app.authenticate, app.requireUserType("admin"), app.requireRole("company_admin")] }, (req, reply) =>
    controller.createCompanyPolicy(req, reply)
  );
  app.post("/companies/:companyId/benefits/assign-policy", { preHandler: [app.authenticate, app.requireUserType("admin"), app.requireRole("company_admin")] }, (req, reply) =>
    controller.bulkAssignPolicy(req, reply)
  );
  app.get("/companies/:companyId/benefits/wallets", { preHandler: [app.authenticate, app.requireUserType("admin"), app.requireRole("company_admin")] }, (req, reply) =>
    controller.getCompanyWallets(req, reply)
  );
  app.get("/companies/:companyId/benefits/wallets/:walletId", { preHandler: [app.authenticate, app.requireUserType("admin"), app.requireRole("company_admin")] }, (req, reply) =>
    controller.getCompanyWalletDetail(req, reply)
  );

  // Platform admin endpoints
  app.post("/admin/benefits/snapshot/run", { preHandler: [app.authenticate, app.requireUserType("admin"), app.requireRole("platform_admin")] }, (req, reply) =>
    controller.runPolicyYearEndSnapshot(req, reply)
  );
  app.get("/admin/benefits/snapshots", { preHandler: [app.authenticate, app.requireUserType("admin"), app.requireRole("platform_admin")] }, (req, reply) =>
    controller.getExpirySnapshots(req, reply)
  );
}