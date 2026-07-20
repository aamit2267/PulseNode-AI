import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { logger } from "../../lib/logger.js";
import type { EmployeesRepository } from "./employees.repository.js";
import type { EmployeeIngestionService } from "../ingestion/ingestion.service.js";

const manualAddSchema = z.object({
  corporateEmail: z.string().email(),
  name: z.string().min(1),
  mobile: z.string().min(1),
  positionGrade: z.string().optional(),
  policyTierName: z.string().optional(),
  // Until the auth module lands, the acting admin is passed explicitly.
  uploadedBy: z.string().min(1),
});

export class EmployeesController {
  constructor(
    private readonly repo: EmployeesRepository,
    private readonly ingestionService: EmployeeIngestionService,
  ) {}

  async listByCompany(
    req: FastifyRequest<{ Params: { companyId: string } }>,
    reply: FastifyReply,
  ) {
    return reply.send(await this.repo.listByCompany(req.params.companyId));
  }

  /** Manual "Add Employee" — same service path as bulk ingestion. */
  async manualAdd(
    req: FastifyRequest<{ Params: { companyId: string } }>,
    reply: FastifyReply,
  ) {
    const parsed = manualAddSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "Invalid employee payload", details: parsed.error.issues });
    }

    const { uploadedBy, ...employee } = parsed.data;
    const outcome = await this.ingestionService.addSingleEmployee({
      companyId: req.params.companyId,
      uploadedBy,
      employee,
    });

    if (outcome.status === "failed") {
      logger.warn(
        { companyId: req.params.companyId, error: outcome.error },
        "manual employee add failed",
      );
      return reply
        .code(422)
        .send({ error: outcome.error, batch: outcome.batch });
    }

    logger.info(
      {
        companyId: req.params.companyId,
        employeeId: outcome.employee?.id,
        status: outcome.status,
      },
      "manual employee add completed",
    );
    return reply
      .code(outcome.status === "created" ? 201 : 200)
      .send(outcome);
  }
}
