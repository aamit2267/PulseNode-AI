import { logger } from "../../lib/logger.js";
import type {
  Employee,
  EmployeesRepository,
} from "../employees/employees.repository.js";
import type { PoliciesRepository } from "../policies/policies.repository.js";
import type {
  IngestionBatch,
  IngestionRepository,
} from "./ingestion.repository.js";
import type { ParsedEmployeeRow, ParseRowError } from "./employee-file-parser.js";

export interface IngestRowsInput {
  companyId: string;
  source: "csv" | "xlsx" | "manual";
  uploadedBy: string;
  rows: ParsedEmployeeRow[];
  /** Rows the parser already rejected; folded into counts + error log. */
  parseErrors?: ParseRowError[];
}

export interface IngestRowsResult {
  batch: IngestionBatch;
}

export interface SingleEmployeeInput {
  companyId: string;
  uploadedBy: string;
  employee: {
    corporateEmail: string;
    name: string;
    mobile: string;
    positionGrade?: string;
    policyTierName?: string;
  };
}

export interface SingleEmployeeOutcome {
  status: "created" | "updated" | "skipped" | "failed";
  employee?: Employee;
  error?: string;
  batch: IngestionBatch;
}

type RowOutcome =
  | { status: "created" | "updated" | "skipped"; employee: Employee }
  | { status: "failed"; reason: string };

export class EmployeeIngestionService {
  constructor(
    private readonly employeesRepo: EmployeesRepository,
    private readonly policiesRepo: PoliciesRepository,
    private readonly ingestionRepo: IngestionRepository,
  ) {}

  /**
   * The single create-or-update path used by BOTH bulk ingestion and the
   * manual "Add Employee" form.
   *
   * Policy assignment is employer-explicit only:
   * - policy_tier_name present → resolve the ACTIVE version of that tier
   *   for this company; an unresolvable name FAILS the row (no guessing).
   * - policy_tier_name absent → employee is created/left unassigned; a
   *   valid state the admin dashboard surfaces. On update, an absent tier
   *   never clears an existing assignment.
   */
  private async upsertOne(
    companyId: string,
    row: ParsedEmployeeRow,
  ): Promise<RowOutcome> {
    let policyId: string | null | undefined; // undefined = leave as-is
    if (row.policyTierName !== undefined) {
      const policy = await this.policiesRepo.findActiveByTierNameInsensitive(
        companyId,
        row.policyTierName,
      );
      if (!policy) {
        return {
          status: "failed",
          reason: `No active policy tier named "${row.policyTierName}" for this company; policy allocation is the employer's decision, so this row was not assigned a fallback`,
        };
      }
      policyId = policy.id;
    }

    const existing = await this.employeesRepo.findByCompanyAndEmail(
      companyId,
      row.corporateEmail,
    );

    if (!existing) {
      const employee = await this.employeesRepo.create({
        companyId,
        corporateEmail: row.corporateEmail,
        name: row.name,
        mobile: row.mobile,
        positionGrade: row.positionGrade ?? null,
        policyId: policyId ?? null,
        enrolledAt: policyId ? new Date() : null,
      });
      return { status: "created", employee };
    }

    const changes: Record<string, unknown> = {};
    if (row.name !== existing.name) changes["name"] = row.name;
    if (row.mobile !== existing.mobile) changes["mobile"] = row.mobile;
    if (
      row.positionGrade !== undefined &&
      row.positionGrade !== existing.positionGrade
    )
      changes["positionGrade"] = row.positionGrade;
    if (policyId !== undefined && policyId !== existing.policyId) {
      changes["policyId"] = policyId;
      if (!existing.enrolledAt) changes["enrolledAt"] = new Date();
    }

    if (Object.keys(changes).length === 0) {
      return { status: "skipped", employee: existing };
    }

    const employee = await this.employeesRepo.update(existing.id, changes);
    return { status: "updated", employee: employee! };
  }

  /** Bulk path: processes every row, never aborts on a bad one, and
   *  records the run as an ingestion_batches row with accurate counts. */
  async ingestRows(input: IngestRowsInput): Promise<IngestRowsResult> {
    const parseErrors = input.parseErrors ?? [];
    const counts = { created: 0, updated: 0, skipped: 0, failed: 0 };
    const errorLog: Array<{ row: number; email?: string; reason: string }> =
      parseErrors.map((e) => ({ row: e.rowNumber, reason: e.reason }));
    counts.failed += parseErrors.length;

    for (const row of input.rows) {
      try {
        const outcome = await this.upsertOne(input.companyId, row);
        if (outcome.status === "failed") {
          counts.failed += 1;
          errorLog.push({
            row: row.rowNumber,
            email: row.corporateEmail,
            reason: outcome.reason,
          });
        } else {
          counts[outcome.status] += 1;
        }
      } catch (err) {
        // A row-level DB error (e.g. constraint violation) must not sink
        // the batch — record it and continue with the remaining rows.
        counts.failed += 1;
        const reason = err instanceof Error ? err.message : String(err);
        errorLog.push({
          row: row.rowNumber,
          email: row.corporateEmail,
          reason,
        });
        logger.error(
          { companyId: input.companyId, row: row.rowNumber, err },
          "employee ingestion row failed",
        );
      }
    }

    const batch = await this.ingestionRepo.create({
      companyId: input.companyId,
      source: input.source,
      uploadedBy: input.uploadedBy,
      rowCount: input.rows.length + parseErrors.length,
      createdCount: counts.created,
      updatedCount: counts.updated,
      skippedCount: counts.skipped,
      failedCount: counts.failed,
      errorLog,
    });

    logger.info(
      {
        companyId: input.companyId,
        batchId: batch.id,
        source: input.source,
        ...counts,
      },
      "employee ingestion batch completed",
    );

    return { batch };
  }

  /** Manual "Add Employee": a one-row batch through the exact same
   *  upsert + policy-resolution logic as bulk ingestion. */
  async addSingleEmployee(
    input: SingleEmployeeInput,
  ): Promise<SingleEmployeeOutcome> {
    const row: ParsedEmployeeRow = {
      rowNumber: 1,
      corporateEmail: input.employee.corporateEmail.trim().toLowerCase(),
      name: input.employee.name,
      mobile: input.employee.mobile,
      ...(input.employee.positionGrade
        ? { positionGrade: input.employee.positionGrade }
        : {}),
      ...(input.employee.policyTierName
        ? { policyTierName: input.employee.policyTierName }
        : {}),
    };

    const { batch } = await this.ingestRows({
      companyId: input.companyId,
      source: "manual",
      uploadedBy: input.uploadedBy,
      rows: [row],
    });

    if (batch.failedCount > 0) {
      return {
        status: "failed",
        error: batch.errorLog[0]?.reason ?? "unknown ingestion failure",
        batch,
      };
    }

    const employee = await this.employeesRepo.findByCompanyAndEmail(
      input.companyId,
      row.corporateEmail,
    );
    const status =
      batch.createdCount > 0
        ? ("created" as const)
        : batch.updatedCount > 0
          ? ("updated" as const)
          : ("skipped" as const);
    return { status, employee: employee!, batch };
  }
}
