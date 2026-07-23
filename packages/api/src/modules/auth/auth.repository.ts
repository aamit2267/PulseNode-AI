import { and, eq } from "drizzle-orm";
import type { Db } from "../../db/postgres/client.js";
import {
  adminUsers,
  doctors,
  employees,
  totpSecrets,
} from "../../db/postgres/schema.js";

export type Employee = typeof employees.$inferSelect;
export type Doctor = typeof doctors.$inferSelect;
export type AdminUser = typeof adminUsers.$inferSelect;
export type TotpSecret = typeof totpSecrets.$inferSelect;

export type NewAdminUser = Omit<
  typeof adminUsers.$inferInsert,
  "id" | "createdAt" | "updatedAt"
>;

export class AuthRepository {
  constructor(private readonly db: Db) {}

  // Employee lookups (pre-provisioned corporate email check)
  async findEmployeeByEmail(
    email: string,
  ): Promise<Employee | undefined> {
    const [row] = await this.db
      .select()
      .from(employees)
      .where(eq(employees.corporateEmail, email.toLowerCase()));
    return row;
  }

  async findEmployeeById(id: string): Promise<Employee | undefined> {
    const [row] = await this.db
      .select()
      .from(employees)
      .where(eq(employees.id, id));
    return row;
  }

  // Doctor lookups
  async findDoctorByEmail(email: string): Promise<Doctor | undefined> {
    const [row] = await this.db
      .select()
      .from(doctors)
      .where(eq(doctors.email, email.toLowerCase()));
    return row;
  }

  async findDoctorByFirebaseUid(firebaseUid: string): Promise<Doctor | undefined> {
    const [row] = await this.db
      .select()
      .from(doctors)
      .where(eq(doctors.firebaseUid, firebaseUid));
    return row;
  }

  async findDoctorById(id: string): Promise<Doctor | undefined> {
    const [row] = await this.db
      .select()
      .from(doctors)
      .where(eq(doctors.id, id));
    return row;
  }

  async createDoctor(data: {
    firebaseUid: string;
    email: string;
    name: string;
    photoUrl?: string;
    city: string;
    consultationModes: string[];
    clinicAddress?: string;
    consultationFeeOnline?: number;
    consultationFeeOffline?: number;
    currency?: string;
  }): Promise<Doctor> {
    const [row] = await this.db
      .insert(doctors)
      .values({
        ...data,
        email: data.email.toLowerCase(),
        status: "pending",
      })
      .returning();
    return row!;
  }

  async updateDoctorStatus(
    id: string,
    status: Doctor["status"],
  ): Promise<Doctor | undefined> {
    const [row] = await this.db
      .update(doctors)
      .set({ status, updatedAt: new Date() })
      .where(eq(doctors.id, id))
      .returning();
    return row;
  }

  // Admin user lookups
  async findAdminByEmail(email: string): Promise<AdminUser | undefined> {
    const [row] = await this.db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.email, email.toLowerCase()));
    return row;
  }

  async findAdminByFirebaseUid(firebaseUid: string): Promise<AdminUser | undefined> {
    const [row] = await this.db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.firebaseUid, firebaseUid));
    return row;
  }

  async findAdminById(id: string): Promise<AdminUser | undefined> {
    const [row] = await this.db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.id, id));
    return row;
  }

  async createAdminUser(data: NewAdminUser): Promise<AdminUser> {
    const [row] = await this.db
      .insert(adminUsers)
      .values({
        ...data,
        email: data.email.toLowerCase(),
      })
      .returning();
    return row!;
  }

  // TOTP secrets
  async createTotpSecret(data: {
    userId: string;
    userType: "employee" | "doctor" | "admin";
    secret: string;
  }): Promise<TotpSecret> {
    const [row] = await this.db
      .insert(totpSecrets)
      .values(data)
      .returning();
    return row!;
  }

  async findTotpSecret(
    userId: string,
    userType: "employee" | "doctor" | "admin",
  ): Promise<TotpSecret | undefined> {
    const [row] = await this.db
      .select()
      .from(totpSecrets)
      .where(
        and(
          eq(totpSecrets.userId, userId),
          eq(totpSecrets.userType, userType),
        ),
      );
    return row;
  }

  async verifyTotpSecret(
    userId: string,
    userType: "employee" | "doctor" | "admin",
  ): Promise<TotpSecret | undefined> {
    const [row] = await this.db
      .update(totpSecrets)
      .set({ isVerified: true, updatedAt: new Date() })
      .where(
        and(
          eq(totpSecrets.userId, userId),
          eq(totpSecrets.userType, userType),
        ),
      )
      .returning();
    return row;
  }

  async deleteTotpSecret(
    userId: string,
    userType: "employee" | "doctor" | "admin",
  ): Promise<void> {
    await this.db
      .delete(totpSecrets)
      .where(
        and(
          eq(totpSecrets.userId, userId),
          eq(totpSecrets.userType, userType),
        ),
      );
  }
}