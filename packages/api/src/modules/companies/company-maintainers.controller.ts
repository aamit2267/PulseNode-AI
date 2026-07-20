import type { FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { logger } from "../../lib/logger.js";
import type { CompanyMaintainersRepository } from "./company-maintainers.repository.js";
import type { NewCompanyMaintainer } from "./company-maintainers.repository.js";

const addMaintainerSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "read-only", "maintainer"]).default("maintainer"),
});

const updateMaintainerSchema = z.object({
  role: z.enum(["admin", "read-only", "maintainer"]),
});

export class CompanyMaintainersController {
  constructor(private readonly repo: CompanyMaintainersRepository) {}

  async addMaintainer(
    req: FastifyRequest<{
      Params: { companyId: string };
      Body: z.infer<typeof addMaintainerSchema>;
    }>,
    reply: FastifyReply,
  ) {
    const parsed = addMaintainerSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "Invalid input", details: parsed.error.issues });
    }

    const { companyId } = req.params;
    const { email, role } = parsed.data;

    // Check if maintainer already exists for this company
    const existing = await this.repo.findByCompanyAndEmail(companyId, email);
    if (existing) {
      return reply
        .code(409)
        .send({ error: "Maintainer already exists for this company" });
    }

    const maintainer = await this.repo.create({
      companyId,
      email: email.toLowerCase(),
      role,
    });

    logger.info(
      { companyId, maintainerId: maintainer.id, role },
      "maintainer added",
    );

    return reply.code(201).send(maintainer);
  }

  async listMaintainers(
    req: FastifyRequest<{ Params: { companyId: string } }>,
    reply: FastifyReply,
  ) {
    const { companyId } = req.params;
    const maintainers = await this.repo.listByCompany(companyId);
    return reply.send(maintainers);
  }

  async updateMaintainer(
    req: FastifyRequest<{
      Params: { companyId: string; maintainerId: string };
      Body: z.infer<typeof updateMaintainerSchema>;
    }>,
    reply: FastifyReply,
  ) {
    const parsed = updateMaintainerSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "Invalid input", details: parsed.error.issues });
    }

    const { companyId, maintainerId } = req.params;
    const { role } = parsed.data;

    const maintainer = await this.repo.findById(maintainerId);
    if (!maintainer || maintainer.companyId !== companyId) {
      return reply.code(404).send({ error: "Maintainer not found" });
    }

    // Prevent removing the last admin
    if (maintainer.role === "admin" && role !== "admin") {
      const adminCount = await this.repo.countAdmins(companyId);
      if (adminCount <= 1) {
        return reply
          .code(400)
          .send({ error: "Cannot remove the only admin maintainer" });
      }
    }

    const updated = await this.repo.updateRole(maintainerId, role);
    logger.info(
      { companyId, maintainerId, oldRole: maintainer.role, newRole: role },
      "maintainer role updated",
    );

    return reply.send(updated);
  }

  async removeMaintainer(
    req: FastifyRequest<{ Params: { companyId: string; maintainerId: string } }>,
    reply: FastifyReply,
  ) {
    const { companyId, maintainerId } = req.params;

    const maintainer = await this.repo.findById(maintainerId);
    if (!maintainer || maintainer.companyId !== companyId) {
      return reply.code(404).send({ error: "Maintainer not found" });
    }

    // Prevent removing the last admin
    if (maintainer.role === "admin") {
      const adminCount = await this.repo.countAdmins(companyId);
      if (adminCount <= 1) {
        return reply
          .code(400)
          .send({ error: "Cannot remove the only admin maintainer" });
      }
    }

    await this.repo.delete(maintainerId);

    logger.info({ companyId, maintainerId }, "maintainer removed");

    return reply.code(204).send();
  }
}