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

export const doctorStatusEnum = pgEnum("doctor_status", [
  "pending",
  "approved",
  "suspended",
]);
export const adminRoleEnum = pgEnum("admin_role", [
  "platform_admin",
  "company_admin",
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

/* -------------------------------------------------------------------------
   DOCTORS -------------------------------------------------------------------
   Doctor profiles with approval status, city, consultation modes, etc.
   ------------------------------------------------------------------------- */
export const doctors = pgTable(
  "doctors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    firebaseUid: text("firebase_uid").notNull().unique(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    photoUrl: text("photo_url"),
    status: doctorStatusEnum("status").notNull().default("pending"),
    city: text("city").notNull(),
    consultationModes: text("consultation_modes").array().notNull().default([]),
    clinicAddress: text("clinic_address"),
    consultationFeeOnline: integer("consultation_fee_online"),
    consultationFeeOffline: integer("consultation_fee_offline"),
    currency: text("currency").notNull().default("INR"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("doctors_status_idx").on(t.status),
    index("doctors_city_idx").on(t.city),
  ],
);

/* -------------------------------------------------------------------------
   DOCTOR_EDUCATION ----------------------------------------------------------
   ------------------------------------------------------------------------- */
export const doctorEducation = pgTable(
  "doctor_education",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    doctorId: uuid("doctor_id")
      .notNull()
      .references(() => doctors.id, { onDelete: "cascade" }),
    degree: text("degree").notNull(),
    institution: text("institution").notNull(),
    year: integer("year"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("doctor_education_doctor_idx").on(t.doctorId)],
);

/* -------------------------------------------------------------------------
   DOCTOR_LANGUAGES ----------------------------------------------------------
   ------------------------------------------------------------------------- */
export const doctorLanguages = pgTable(
  "doctor_languages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    doctorId: uuid("doctor_id")
      .notNull()
      .references(() => doctors.id, { onDelete: "cascade" }),
    language: text("language").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("doctor_languages_doctor_idx").on(t.doctorId)],
);

/* -------------------------------------------------------------------------
   DOCTOR_AVAILABILITY -------------------------------------------------------
   ------------------------------------------------------------------------- */
export const doctorAvailability = pgTable(
  "doctor_availability",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    doctorId: uuid("doctor_id")
      .notNull()
      .references(() => doctors.id, { onDelete: "cascade" }),
    dayOfWeek: integer("day_of_week").notNull(), // 0-6
    startTime: text("start_time").notNull(), // HH:mm
    endTime: text("end_time").notNull(), // HH:mm
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("doctor_availability_doctor_idx").on(t.doctorId)],
);

/* -------------------------------------------------------------------------
   ADMIN_USERS ---------------------------------------------------------------
   Platform admins and company admins (manually provisioned)
   ------------------------------------------------------------------------- */
export const adminUsers = pgTable(
  "admin_users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    firebaseUid: text("firebase_uid").notNull().unique(),
    email: text("email").notNull().unique(),
    name: text("name").notNull(),
    role: adminRoleEnum("role").notNull(),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("admin_users_company_idx").on(t.companyId),
  ],
);

/* -------------------------------------------------------------------------
   TOTP_SECRETS --------------------------------------------------------------
   Stores TOTP secrets for 2FA (company-mandated MFA)
   ------------------------------------------------------------------------- */
export const totpSecrets = pgTable(
  "totp_secrets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(), // references employees, doctors, or admin_users
    userType: text("user_type").notNull(), // 'employee', 'doctor', 'admin'
    secret: text("secret").notNull(),
    isVerified: boolean("is_verified").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("totp_secrets_user_unique").on(t.userId, t.userType),
  ],
);