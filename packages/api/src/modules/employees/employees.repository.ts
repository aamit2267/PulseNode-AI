import { and, eq } from "drizzle-orm";
import type { Db } from "../../db/postgres/client.js";
import { dependents, employees } from "../../db/postgres/schema.js";

export type Employee = typeof employees.$inferSelect;
export type NewEmployee = Omit<
  typeof employees.$inferInsert,
  "id" | "createdAt" | "updatedAt"
>;
export type EmployeeUpdate = Partial<
  Pick<
    NewEmployee,
    | "name"
    | "mobile"
    | "positionGrade"
    | "policyId"
    | "status"
    | "enrolledAt"
    | "policyExpiryDate"
  >
>;
export type Dependent = typeof dependents.$inferSelect;

export class EmployeesRepository {
  constructor(private readonly db: Db) {}

  async create(data: NewEmployee): Promise<Employee> {
    const [row] = await this.db.insert(employees).values(data).returning();
    return row!;
  }

  async findById(id: string): Promise<Employee | undefined> {
    const [row] = await this.db
      .select()
      .from(employees)
      .where(eq(employees.id, id));
    return row;
  }

  async findByCompanyAndEmail(
    companyId: string,
    corporateEmail: string,
  ): Promise<Employee | undefined> {
    const [row] = await this.db
      .select()
      .from(employees)
      .where(
        and(
          eq(employees.companyId, companyId),
          eq(employees.corporateEmail, corporateEmail),
        ),
      );
    return row;
  }

  async update(
    id: string,
    data: EmployeeUpdate,
  ): Promise<Employee | undefined> {
    const [row] = await this.db
      .update(employees)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(employees.id, id))
      .returning();
    return row;
  }

  async listByCompany(companyId: string): Promise<Employee[]> {
    return this.db
      .select()
      .from(employees)
      .where(eq(employees.companyId, companyId));
  }

  async addDependent(
    employeeId: string,
    data: { name: string; relationship: string },
  ): Promise<Dependent> {
    const [row] = await this.db
      .insert(dependents)
      .values({ employeeId, ...data })
      .returning();
    return row!;
  }

  async listDependents(employeeId: string): Promise<Dependent[]> {
    return this.db
      .select()
      .from(dependents)
      .where(eq(dependents.employeeId, employeeId));
  }
}
