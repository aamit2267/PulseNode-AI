CREATE TYPE "public"."maintainer_role" AS ENUM('admin', 'read-only', 'maintainer');--> statement-breakpoint
CREATE TABLE "company_maintainers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" "maintainer_role" DEFAULT 'maintainer' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "company_maintainers" ADD CONSTRAINT "company_maintainers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "company_maintainers_company_email_unique" ON "company_maintainers" USING btree ("company_id","email");--> statement-breakpoint
CREATE INDEX "company_maintainers_company_idx" ON "company_maintainers" USING btree ("company_id");