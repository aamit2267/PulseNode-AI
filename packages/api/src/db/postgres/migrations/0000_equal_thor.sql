CREATE TYPE "public"."coverage_basis" AS ENUM('lump_sum', 'per_illness');--> statement-breakpoint
CREATE TYPE "public"."employee_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."ingestion_source" AS ENUM('csv', 'xlsx', 'manual');--> statement-breakpoint
CREATE TYPE "public"."policy_kind" AS ENUM('individual', 'family_floater');--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"corporate_email_domain" text NOT NULL,
	"mfa_required" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "companies_corporate_email_domain_unique" UNIQUE("corporate_email_domain")
);
--> statement-breakpoint
CREATE TABLE "dependents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"name" text NOT NULL,
	"relationship" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"policy_id" uuid,
	"corporate_email" text NOT NULL,
	"name" text NOT NULL,
	"mobile" text NOT NULL,
	"position_grade" text,
	"status" "employee_status" DEFAULT 'active' NOT NULL,
	"enrolled_at" timestamp with time zone,
	"policy_expiry_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingestion_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"source" "ingestion_source" NOT NULL,
	"uploaded_by" text NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"created_count" integer DEFAULT 0 NOT NULL,
	"updated_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"error_log" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"tier_name" text NOT NULL,
	"sum_insured" integer NOT NULL,
	"policy_kind" "policy_kind" NOT NULL,
	"coverage_basis" "coverage_basis" NOT NULL,
	"room_rent_limit" integer,
	"co_pay_percent" integer,
	"waiting_period_days" integer,
	"wallet_limit_consultation" integer NOT NULL,
	"wallet_limit_medicine" integer NOT NULL,
	"wallet_limit_lab_test" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dependents" ADD CONSTRAINT "dependents_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_policy_id_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."policies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_batches" ADD CONSTRAINT "ingestion_batches_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policies" ADD CONSTRAINT "policies_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dependents_employee_idx" ON "dependents" USING btree ("employee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "employees_company_email_uq" ON "employees" USING btree ("company_id","corporate_email");--> statement-breakpoint
CREATE INDEX "employees_company_idx" ON "employees" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "ingestion_batches_company_idx" ON "ingestion_batches" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "policies_company_tier_version_uq" ON "policies" USING btree ("company_id","tier_name","version");--> statement-breakpoint
CREATE UNIQUE INDEX "policies_one_active_per_tier_uq" ON "policies" USING btree ("company_id","tier_name") WHERE "policies"."is_active" = true;