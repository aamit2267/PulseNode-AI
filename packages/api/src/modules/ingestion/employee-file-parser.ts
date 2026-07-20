import Papa from "papaparse";
import * as XLSX from "xlsx";
import { z } from "zod";

export interface ParsedEmployeeRow {
  rowNumber: number; // 1-based, counting the header as row 1
  corporateEmail: string;
  name: string;
  mobile: string;
  positionGrade?: string;
  policyTierName?: string;
}

export interface ParseRowError {
  rowNumber: number;
  reason: string;
}

export interface ParseResult {
  rows: ParsedEmployeeRow[];
  errors: ParseRowError[];
}

const REQUIRED_HEADERS = ["corporate_email", "name", "mobile"] as const;

const rowSchema = z.object({
  corporate_email: z
    .string()
    .min(1, "corporate_email is required")
    .email("corporate_email is not a valid email"),
  name: z.string().min(1, "name is required"),
  mobile: z.string().min(1, "mobile is required"),
  position_grade: z.string().optional(),
  policy_tier_name: z.string().optional(),
});

function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeRawRows(
  rawRows: Array<Record<string, unknown>>,
): ParseResult {
  const rows: ParsedEmployeeRow[] = [];
  const errors: ParseRowError[] = [];

  rawRows.forEach((raw, i) => {
    const rowNumber = i + 2; // +1 for 1-based, +1 for the header row
    const candidate = {
      corporate_email: cell(raw["corporate_email"]).toLowerCase(),
      name: cell(raw["name"]),
      mobile: cell(raw["mobile"]),
      position_grade: cell(raw["position_grade"]) || undefined,
      policy_tier_name: cell(raw["policy_tier_name"]) || undefined,
    };

    const parsed = rowSchema.safeParse(candidate);
    if (!parsed.success) {
      errors.push({
        rowNumber,
        reason: parsed.error.issues
          .map((iss) => `${iss.path.join(".")}: ${iss.message}`)
          .join("; "),
      });
      return;
    }

    rows.push({
      rowNumber,
      corporateEmail: parsed.data.corporate_email,
      name: parsed.data.name,
      mobile: parsed.data.mobile,
      ...(parsed.data.position_grade
        ? { positionGrade: parsed.data.position_grade }
        : {}),
      ...(parsed.data.policy_tier_name
        ? { policyTierName: parsed.data.policy_tier_name }
        : {}),
    });
  });

  return { rows, errors };
}

function assertRequiredHeaders(headers: string[]): void {
  const present = new Set(headers.map((h) => h.trim().toLowerCase()));
  const missing = REQUIRED_HEADERS.filter((h) => !present.has(h));
  if (missing.length > 0) {
    throw new Error(
      `Missing required column header(s): ${missing.join(", ")}. Expected at least: ${REQUIRED_HEADERS.join(", ")}`,
    );
  }
}

/**
 * Parse an uploaded employee roster (CSV or XLSX) into normalized rows.
 * Pure function of the buffer — no DB access — so it is testable in
 * isolation and reusable by any ingestion entry point.
 */
export function parseEmployeeFile(
  buffer: Buffer,
  format: "csv" | "xlsx",
): ParseResult {
  if (format === "csv") {
    const parsed = Papa.parse<Record<string, unknown>>(
      buffer.toString("utf8"),
      { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim() },
    );
    assertRequiredHeaders(parsed.meta.fields ?? []);
    return normalizeRawRows(parsed.data);
  }

  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("Workbook contains no sheets");
  const sheet = workbook.Sheets[sheetName]!;
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
  });
  const headerRow = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    range: 0,
  })[0];
  assertRequiredHeaders((headerRow ?? []).map(String));
  return normalizeRawRows(rawRows);
}
