CREATE TYPE "public"."admin_role" AS ENUM('platform_admin', 'company_admin');--> statement-breakpoint
CREATE TYPE "public"."doctor_status" AS ENUM('pending', 'approved', 'suspended');--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firebase_uid" text NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" "admin_role" NOT NULL,
	"company_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_users_firebase_uid_unique" UNIQUE("firebase_uid"),
	CONSTRAINT "admin_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "doctor_availability" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doctor_id" uuid NOT NULL,
	"day_of_week" integer NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "doctor_education" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doctor_id" uuid NOT NULL,
	"degree" text NOT NULL,
	"institution" text NOT NULL,
	"year" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "doctor_languages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doctor_id" uuid NOT NULL,
	"language" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "doctors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firebase_uid" text NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"photo_url" text,
	"status" "doctor_status" DEFAULT 'pending' NOT NULL,
	"city" text NOT NULL,
	"consultation_modes" text[] DEFAULT '{}' NOT NULL,
	"clinic_address" text,
	"consultation_fee_online" integer,
	"consultation_fee_offline" integer,
	"currency" text DEFAULT 'INR' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "doctors_firebase_uid_unique" UNIQUE("firebase_uid")
);
--> statement-breakpoint
CREATE TABLE "totp_secrets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"user_type" text NOT NULL,
	"secret" text NOT NULL,
	"is_verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_availability" ADD CONSTRAINT "doctor_availability_doctor_id_doctors_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_education" ADD CONSTRAINT "doctor_education_doctor_id_doctors_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_languages" ADD CONSTRAINT "doctor_languages_doctor_id_doctors_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_users_company_idx" ON "admin_users" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "doctor_availability_doctor_idx" ON "doctor_availability" USING btree ("doctor_id");--> statement-breakpoint
CREATE INDEX "doctor_education_doctor_idx" ON "doctor_education" USING btree ("doctor_id");--> statement-breakpoint
CREATE INDEX "doctor_languages_doctor_idx" ON "doctor_languages" USING btree ("doctor_id");--> statement-breakpoint
CREATE INDEX "doctors_status_idx" ON "doctors" USING btree ("status");--> statement-breakpoint
CREATE INDEX "doctors_city_idx" ON "doctors" USING btree ("city");--> statement-breakpoint
CREATE UNIQUE INDEX "totp_secrets_user_unique" ON "totp_secrets" USING btree ("user_id","user_type");