ALTER TABLE "doctors" ADD COLUMN "specialty" text;--> statement-breakpoint
CREATE INDEX "doctors_specialty_idx" ON "doctors" USING btree ("specialty");