import { and, eq, sql } from "drizzle-orm";
import type { Db } from "../../db/postgres/client.js";
import {
  doctorAvailability,
  doctorEducation,
  doctorLanguages,
  doctors,
} from "../../db/postgres/schema.js";

export type Doctor = typeof doctors.$inferSelect;
export type NewDoctor = Omit<typeof doctors.$inferInsert, "id" | "createdAt" | "updatedAt" | "status">;
export type DoctorUpdate = Partial<Omit<typeof doctors.$inferInsert, "id" | "createdAt" | "updatedAt">>;

export type DoctorEducation = typeof doctorEducation.$inferSelect;
export type NewDoctorEducation = Omit<typeof doctorEducation.$inferInsert, "id" | "createdAt">;

export type DoctorLanguage = typeof doctorLanguages.$inferSelect;
export type NewDoctorLanguage = Omit<typeof doctorLanguages.$inferInsert, "id" | "createdAt">;

export type DoctorAvailability = typeof doctorAvailability.$inferSelect;
export type NewDoctorAvailability = Omit<typeof doctorAvailability.$inferInsert, "id" | "createdAt">;

export class DoctorsRepository {
  constructor(private readonly db: Db) {}

  // ==================== DOCTOR PROFILE ====================

  async findById(id: string): Promise<Doctor | undefined> {
    const [row] = await this.db
      .select()
      .from(doctors)
      .where(eq(doctors.id, id));
    return row;
  }

  async findByEmail(email: string): Promise<Doctor | undefined> {
    const [row] = await this.db
      .select()
      .from(doctors)
      .where(eq(doctors.email, email.toLowerCase()));
    return row;
  }

  async findByFirebaseUid(firebaseUid: string): Promise<Doctor | undefined> {
    const [row] = await this.db
      .select()
      .from(doctors)
      .where(eq(doctors.firebaseUid, firebaseUid));
    return row;
  }

  async create(data: NewDoctor): Promise<Doctor> {
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

  async update(id: string, data: DoctorUpdate): Promise<Doctor | undefined> {
    const [row] = await this.db
      .update(doctors)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(doctors.id, id))
      .returning();
    return row;
  }

  async updateStatus(id: string, status: Doctor["status"]): Promise<Doctor | undefined> {
    const [row] = await this.db
      .update(doctors)
      .set({ status, updatedAt: new Date() })
      .where(eq(doctors.id, id))
      .returning();
    return row;
  }

  async listByStatus(status: Doctor["status"]): Promise<Doctor[]> {
    return this.db
      .select()
      .from(doctors)
      .where(eq(doctors.status, status));
  }

  async listByCityAndStatus(city: string, status: Doctor["status"]): Promise<Doctor[]> {
    return this.db
      .select()
      .from(doctors)
      .where(and(eq(doctors.city, city), eq(doctors.status, status)));
  }

  async listApprovedByCity(city: string): Promise<Doctor[]> {
    return this.db
      .select()
      .from(doctors)
      .where(and(eq(doctors.city, city), eq(doctors.status, "approved")));
  }

  async listApprovedBySpecialty(specialty: string): Promise<Doctor[]> {
    // This would require a specialty field or joining with a specialties table
    // For now, we filter by city and status
    return this.db
      .select()
      .from(doctors)
      .where(eq(doctors.status, "approved"));
  }

  // ==================== DOCTOR EDUCATION ====================

  async addEducation(data: NewDoctorEducation): Promise<DoctorEducation> {
    const [row] = await this.db
      .insert(doctorEducation)
      .values(data)
      .returning();
    return row!;
  }

  async getEducation(doctorId: string): Promise<DoctorEducation[]> {
    return this.db
      .select()
      .from(doctorEducation)
      .where(eq(doctorEducation.doctorId, doctorId));
  }

  async deleteEducation(id: string): Promise<void> {
    await this.db
      .delete(doctorEducation)
      .where(eq(doctorEducation.id, id));
  }

  // ==================== DOCTOR LANGUAGES ====================

  async addLanguage(data: NewDoctorLanguage): Promise<DoctorLanguage> {
    const [row] = await this.db
      .insert(doctorLanguages)
      .values(data)
      .returning();
    return row!;
  }

  async getLanguages(doctorId: string): Promise<DoctorLanguage[]> {
    return this.db
      .select()
      .from(doctorLanguages)
      .where(eq(doctorLanguages.doctorId, doctorId));
  }

  async deleteLanguage(id: string): Promise<void> {
    await this.db
      .delete(doctorLanguages)
      .where(eq(doctorLanguages.id, id));
  }

  // ==================== DOCTOR AVAILABILITY ====================

  async addAvailability(data: NewDoctorAvailability): Promise<DoctorAvailability> {
    const [row] = await this.db
      .insert(doctorAvailability)
      .values(data)
      .returning();
    return row!;
  }

  async getAvailability(doctorId: string): Promise<DoctorAvailability[]> {
    return this.db
      .select()
      .from(doctorAvailability)
      .where(eq(doctorAvailability.doctorId, doctorId));
  }

  async getAvailabilityByDay(doctorId: string, dayOfWeek: number): Promise<DoctorAvailability[]> {
    return this.db
      .select()
      .from(doctorAvailability)
      .where(and(eq(doctorAvailability.doctorId, doctorId), eq(doctorAvailability.dayOfWeek, dayOfWeek)));
  }

  async deleteAvailability(id: string): Promise<void> {
    await this.db
      .delete(doctorAvailability)
      .where(eq(doctorAvailability.id, id));
  }

  async clearAvailability(doctorId: string): Promise<void> {
    await this.db
      .delete(doctorAvailability)
      .where(eq(doctorAvailability.doctorId, doctorId));
  }

  // ==================== COMPOSITE QUERIES ====================

  async getFullProfile(doctorId: string): Promise<{
    doctor: Doctor | undefined;
    education: DoctorEducation[];
    languages: DoctorLanguage[];
    availability: DoctorAvailability[];
  } | undefined> {
    const doctor = await this.findById(doctorId);
    if (!doctor) return undefined;

    const [education, languages, availability] = await Promise.all([
      this.getEducation(doctorId),
      this.getLanguages(doctorId),
      this.getAvailability(doctorId),
    ]);

    return { doctor, education, languages, availability };
  }

  async searchApproved(filters: {
    city?: string;
    consultationMode?: string;
    specialty?: string;
    language?: string;
    limit?: number;
    offset?: number;
  }): Promise<Doctor[]> {
    const conditions = [eq(doctors.status, "approved")];

    if (filters.city) {
      conditions.push(eq(doctors.city, filters.city));
    }

    if (filters.consultationMode) {
      conditions.push(sql`${doctors.consultationModes} @> ARRAY[${filters.consultationMode}]`);
    }

    // For specialty/language, we'd need joins - simplified for now
    return this.db
      .select()
      .from(doctors)
      .where(and(...conditions))
      .limit(filters.limit ?? 20)
      .offset(filters.offset ?? 0);
  }

  async countApproved(filters: { city?: string; consultationMode?: string }): Promise<number> {
    const conditions = [eq(doctors.status, "approved")];

    if (filters.city) {
      conditions.push(eq(doctors.city, filters.city));
    }

    if (filters.consultationMode) {
      conditions.push(sql`${doctors.consultationModes} @> ARRAY[${filters.consultationMode}]`);
    }

    const [result] = await this.db
      .select({ count: sql`count(*)` })
      .from(doctors)
      .where(and(...conditions));
    return Number(result?.count ?? 0);
  }
}