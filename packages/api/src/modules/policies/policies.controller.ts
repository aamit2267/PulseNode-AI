import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { logger } from "../../lib/logger.js";
import type { PoliciesRepository } from "./policies.repository.js";

const createPolicySchema = z.object({
  tierName: z.string().min(1),
  sumInsured: z.number().int().positive(),
  policyKind: z.enum(["individual", "family_floater"]),
  coverageBasis: z.enum(["lump_sum", "per_illness"]),
  roomRentLimit: z.number().int().positive().nullish(),
  coPayPercent: z.number().int().min(0).max(100).nullish(),
  waitingPeriodDays: z.number().int().min(0).nullish(),
  walletLimitConsultation: z.number().int().min(0),
  walletLimitMedicine: z.number().int().min(0),
  walletLimitLabTest: z.number().int().min(0),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const editPolicySchema = createPolicySchema
  .omit({ tierName: true })
  .partial();

export class PoliciesController {
  constructor(private readonly repo: PoliciesRepository) {}

  async create(
    req: FastifyRequest<{ Params: { companyId: string } }>,
    reply: FastifyReply,
  ) {
    const parsed = createPolicySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "Invalid policy payload", details: parsed.error.issues });
    }

    const existing = await this.repo.findActiveByTierName(
      req.params.companyId,
      parsed.data.tierName,
    );
    if (existing) {
      return reply.code(409).send({
        error: `Tier "${parsed.data.tierName}" already has an active version; edit it to create a new version`,
      });
    }

    const policy = await this.repo.create({
      ...parsed.data,
      companyId: req.params.companyId,
    });
    logger.info(
      { companyId: req.params.companyId, policyId: policy.id },
      "policy created",
    );
    return reply.code(201).send(policy);
  }

  async getById(
    req: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) {
    const policy = await this.repo.findById(req.params.id);
    if (!policy) return reply.code(404).send({ error: "Policy not found" });
    return reply.send(policy);
  }

  async listByCompany(
    req: FastifyRequest<{ Params: { companyId: string } }>,
    reply: FastifyReply,
  ) {
    return reply.send(await this.repo.listByCompany(req.params.companyId));
  }

  /** "Edit" = create a new version; the existing row is never mutated. */
  async edit(
    req: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) {
    const parsed = editPolicySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "Invalid policy edit", details: parsed.error.issues });
    }
    try {
      const next = await this.repo.createNewVersion(req.params.id, parsed.data);
      logger.info(
        { policyId: req.params.id, newPolicyId: next.id, version: next.version },
        "policy versioned",
      );
      return reply.send(next);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ policyId: req.params.id, err }, "policy edit failed");
      if (/not found/i.test(message)) {
        return reply.code(404).send({ error: message });
      }
      if (/inactive/i.test(message)) {
        return reply.code(409).send({ error: message });
      }
      throw err;
    }
  }
}
