import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const policyKindEnum = pgEnum("policy_kind", [
  "individual",
  "family_floater",
]);
export const coverageBasisEnum = pgEnum("coverage_basis", [
  "lump_sum",
  "per_illness",
]);
export const employeeStatusEnum = pgEnum("employee_status", [
  "active",
  "inactive",
]);
export const ingestionSourceEnum = pgEnum("ingestion_source", [
  "csv",
  "xlsx",
  "manual",
]);
export const maintainerRoleEnum = pgEnum("maintainer_role", [
  "admin",
  "read-only",
  "maintainer",
]);

/* -------------------------------------------------------------------------
   COMPANIES -----------------------------------------------------------------
   ------------------------------------------------------------------------- */
export const companies = pgTable("companies", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  corporateEmailDomain: text("corporate_email_domain").notNull().unique(),
  mfaRequired: boolean("mfa_required").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/* -------------------------------------------------------------------------
   POLICIES ------------------------------------------------------------------
   Versioned policy rows – never updated in‑place
   ------------------------------------------------------------------------- */
export const policies = pgTable(
  "policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    tierName: text("tier_name").notNull(),
    sumInsured: integer("sum_insured").notNull(),
    policyKind: policyKindEnum("policy_kind").notNull(),
    coverageBasis: coverageBasisEnum("coverage_basis").notNull(),
    roomRentLimit: integer("room_rent_limit"),
    coPayPercent: integer("co_pay_percent"),
    waitingPeriodDays: integer("waiting_period_days"),
    walletLimitConsultation: integer("wallet_limit_consultation").notNull(),
    walletLimitMedicine: integer("wallet_limit_medicine").notNull(),
    walletLimitLabTest: integer("wallet_limit_lab_test").notNull(),
    version: integer("version").notNull().default(1),
    isActive: boolean("is_active").notNull().default(true),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("policies_company_tier_version_uq").on(
      t.companyId,
      t.tierName,
      t.version,
    ),
    uniqueIndex("policies_one_active_per_tier_uq")
      .on(t.companyId, t.tierName)
      .where(sql`${t.isActive} = true`),
  ],
);

/* -------------------------------------------------------------------------
   EMPLOYEES -----------------------------------------------------------------
   ------------------------------------------------------------------------- */
export const employees = pgTable(
  "employees",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    policyId: uuid("policy_id").references(() => policies.id),
    corporateEmail: text("corporate_email").notNull(),
    name: text("name").notNull(),
    mobile: text("mobile").notNull(),
    positionGrade: text("position_grade"),
    status: employeeStatusEnum("status").notNull().default("active"),
    enrolledAt: timestamp("enrolled_at", { withTimezone: true }),
    policyExpiryDate: date("policy_expiry_date"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("employees_company_email_uq").on(t.companyId, t.corporateEmail),
    index("employees_company_idx").on(t.companyId),
  ],
);

/* -------------------------------------------------------------------------
   DEPENDENTS ---------------------------------------------------------------
   ------------------------------------------------------------------------- */
export const dependents = pgTable(
  "dependents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    relationship: text("relationship").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("dependents_employee_idx").on(t.employeeId)],
);

/* -------------------------------------------------------------------------
   INGESTION_BATCHES --------------------------------------------------------
   ------------------------------------------------------------------------- */
export const ingestionBatches = pgTable(
  "ingestion_batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    source: ingestionSourceEnum("source").notNull(),
    uploadedBy: text("uploaded_by").notNull(),
    rowCount: integer("row_count").notNull().default(0),
    createdCount: integer("created_count").notNull().default(0),
    updatedCount: integer("updated_count").notNull().default(0),
    skippedCount: integer("skipped_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    errorLog: jsonb("error_log")
      .$type<Array<{ row: number; email?: string; reason: string }>>()
      .notNull()
      .default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("ingestion_batches_company_idx").on(t.companyId)],
);

/* -------------------------------------------------------------------------
   COMPANY_MAINTAINERS -------------------------------------------------------
   Stores maintainers for each company with role-based access control
   ------------------------------------------------------------------------- */
export const companyMaintainers = pgTable(
  "company_maintainers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: maintainerRoleEnum("role").notNull().default("maintainer"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("company_maintainers_company_email_unique")
      .on(t.companyId, t.email),
    index("company_maintainers_company_idx").on(t.companyId),
  ],
);