import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { CompaniesRepository } from "./companies.repository.js";

const createCompanySchema = z.object({
  name: z.string().min(1),
  corporateEmailDomain: z.string().min(3),
  mfaRequired: z.boolean().optional(),
});

export class CompaniesController {
  constructor(private readonly repo: CompaniesRepository) {}

  async create(req: FastifyRequest, reply: FastifyReply) {
    const parsed = createCompanySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "Invalid company payload", details: parsed.error.issues });
    }
    const company = await this.repo.create(parsed.data);
    return reply.code(201).send(company);
  }

  async getById(
    req: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) {
    const company = await this.repo.findById(req.params.id);
    if (!company) return reply.code(404).send({ error: "Company not found" });
    return reply.send(company);
  }
}
