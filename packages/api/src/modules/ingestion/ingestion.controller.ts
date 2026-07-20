import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { logger } from "../../lib/logger.js";
import { parseEmployeeFile } from "./employee-file-parser.js";
import type { EmployeeIngestionService } from "./ingestion.service.js";

const querySchema = z.object({ uploadedBy: z.string().min(1) });

function detectFormat(filename: string, mimetype: string): "csv" | "xlsx" | undefined {
  if (filename.endsWith(".csv") || mimetype === "text/csv") return "csv";
  if (
    filename.endsWith(".xlsx") ||
    mimetype ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  )
    return "xlsx";
  return undefined;
}

export class IngestionController {
  constructor(private readonly service: EmployeeIngestionService) {}

  async bulkUpload(
    req: FastifyRequest<{ Params: { companyId: string } }>,
    reply: FastifyReply,
  ) {
    const query = querySchema.safeParse(req.query);
    if (!query.success) {
      return reply
        .code(400)
        .send({ error: "uploadedBy query parameter is required" });
    }

    const file = await req.file();
    if (!file) {
      return reply.code(400).send({ error: "A file upload is required" });
    }

    const format = detectFormat(file.filename ?? "", file.mimetype);
    if (!format) {
      return reply
        .code(400)
        .send({ error: "Unsupported file type; upload .csv or .xlsx" });
    }

    const buffer = await file.toBuffer();

    let parsed;
    try {
      parsed = parseEmployeeFile(buffer, format);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(
        { companyId: req.params.companyId, format, message },
        "employee file rejected at parse stage",
      );
      return reply.code(400).send({ error: message });
    }

    const { batch } = await this.service.ingestRows({
      companyId: req.params.companyId,
      source: format,
      uploadedBy: query.data.uploadedBy,
      rows: parsed.rows,
      parseErrors: parsed.errors,
    });

    return reply.code(201).send(batch);
  }
}
