import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseEmployeeFile } from "../../src/modules/ingestion/employee-file-parser.js";

const CSV_HEADER = "corporate_email,name,mobile,position_grade,policy_tier_name";

function csvBuffer(rows: string[]): Buffer {
  return Buffer.from([CSV_HEADER, ...rows].join("\n"), "utf8");
}

function xlsxBuffer(rows: Array<Record<string, unknown>>): Buffer {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Employees");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("parseEmployeeFile (csv)", () => {
  it("parses well-formed rows into normalized records", () => {
    const result = parseEmployeeFile(
      csvBuffer([
        "jane@acme.example.com,Jane Doe,+919800000001,L2,Gold",
        "raj@acme.example.com,Raj Patel,+919800000002,L1,",
      ]),
      "csv",
    );

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual({
      rowNumber: 2,
      corporateEmail: "jane@acme.example.com",
      name: "Jane Doe",
      mobile: "+919800000001",
      positionGrade: "L2",
      policyTierName: "Gold",
    });
    // Empty tier cell -> undefined, not empty string.
    expect(result.rows[1]!.policyTierName).toBeUndefined();
    expect(result.errors).toHaveLength(0);
  });

  it("trims whitespace and normalizes email casing", () => {
    const result = parseEmployeeFile(
      csvBuffer(["  Jane.DOE@Acme.example.com , Jane Doe ,+919800000001,,"]),
      "csv",
    );
    expect(result.rows[0]!.corporateEmail).toBe("jane.doe@acme.example.com");
    expect(result.rows[0]!.name).toBe("Jane Doe");
  });

  it("reports rows missing required fields as row-level errors without dropping good rows", () => {
    const result = parseEmployeeFile(
      csvBuffer([
        "jane@acme.example.com,Jane Doe,+919800000001,,Gold",
        ",No Email,+919800000003,,",
        "noname@acme.example.com,,+919800000004,,",
      ]),
      "csv",
    );
    expect(result.rows).toHaveLength(1);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0]!.rowNumber).toBe(3);
    expect(result.errors[0]!.reason).toMatch(/corporate_email/);
    expect(result.errors[1]!.rowNumber).toBe(4);
    expect(result.errors[1]!.reason).toMatch(/name/);
  });

  it("rejects an invalid email format as a row error", () => {
    const result = parseEmployeeFile(
      csvBuffer(["not-an-email,Jane Doe,+919800000001,,"]),
      "csv",
    );
    expect(result.rows).toHaveLength(0);
    expect(result.errors[0]!.reason).toMatch(/email/i);
  });

  it("fails cleanly when required headers are missing", () => {
    const buf = Buffer.from("email,full_name\na@b.com,A B", "utf8");
    expect(() => parseEmployeeFile(buf, "csv")).toThrow(/header|column/i);
  });
});

describe("parseEmployeeFile (xlsx)", () => {
  it("parses an xlsx sheet with the same normalization as csv", () => {
    const buf = xlsxBuffer([
      {
        corporate_email: "Jane@Acme.example.com ",
        name: "Jane Doe",
        mobile: "+919800000001",
        position_grade: "L2",
        policy_tier_name: "Gold",
      },
      {
        corporate_email: "raj@acme.example.com",
        name: "Raj Patel",
        mobile: 9800000002, // numeric cell — must coerce to string
      },
    ]);

    const result = parseEmployeeFile(buf, "xlsx");
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]!.corporateEmail).toBe("jane@acme.example.com");
    expect(result.rows[0]!.policyTierName).toBe("Gold");
    expect(result.rows[1]!.mobile).toBe("9800000002");
    expect(result.rows[1]!.policyTierName).toBeUndefined();
  });

  it("collects row-level errors from xlsx too", () => {
    const buf = xlsxBuffer([
      { corporate_email: "ok@acme.example.com", name: "OK", mobile: "1" },
      { corporate_email: "", name: "No Email", mobile: "2" },
    ]);
    const result = parseEmployeeFile(buf, "xlsx");
    expect(result.rows).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
  });
});
