import { logger } from "../../lib/logger.js";
import type { CompanyMaintainersRepository } from "./company-maintainers.repository.js";
import type { CompaniesRepository } from "./companies.repository.js";
import type { CompanyMaintainer, NewCompanyMaintainer, MaintainerRole } from "./company-maintainers.repository.js";

export interface AddMaintainerInput {
  companyId: string;
  adminEmail: string; // email of the admin making the request
  maintainerEmail: string;
  role: MaintainerRole;
}

export interface AddMaintainerResult {
  maintainer: CompanyMaintainer;
}

export class CompanyMaintainersService {
  constructor(
    private readonly maintainersRepo: CompanyMaintainersRepository,
    private readonly companiesRepo: CompaniesRepository,
  ) {}

  /**
   * Add a new maintainer to a company.
   * Only a company admin can add maintainers.
   * The new maintainer list is not visible to other maintainers.
   */
  async addMaintainer(input: AddMaintainerInput): Promise<AddMaintainerResult> {
    // Verify the requesting admin has admin permission
    const isAdmin = await this.maintainersRepo.isAdminForCompany(
      input.companyId,
      input.adminEmail,
    );

    if (!isAdmin) {
      throw new Error("Only company admins can add maintainers");
    }

    // Verify company exists
    const company = await this.companiesRepo.findById(input.companyId);
    if (!company) {
      throw new Error("Company not found");
    }

    // Check if maintainer already exists
    const existing = await this.maintainersRepo.findByCompanyAndEmail(
      input.companyId,
      input.maintainerEmail,
    );
    if (existing) {
      throw new Error("Maintainer with this email already exists for this company");
    }

    // Validate role
    const validRoles: MaintainerRole[] = ["admin", "read-only", "maintainer"];
    if (!validRoles.includes(input.role)) {
      throw new Error(`Invalid role. Must be one of: ${validRoles.join(", ")}`);
    }

    const maintainerData: NewCompanyMaintainer = {
      companyId: input.companyId,
      email: input.maintainerEmail.toLowerCase(),
      role: input.role,
    };

    const maintainer = await this.maintainersRepo.create(maintainerData);

    logger.info(
      { companyId: input.companyId, maintainerEmail: input.maintainerEmail, role: input.role },
      "Maintainer added",
    );

    return { maintainer };
  }

  /**
   * List all maintainers for a company.
   * Only admins can see the list.
   */
  async listMaintainers(
    companyId: string,
    adminEmail: string,
  ): Promise<CompanyMaintainer[]> {
    const isAdmin = await this.maintainersRepo.isAdminForCompany(companyId, adminEmail);
    if (!isAdmin) {
      throw new Error("Only company admins can view maintainers");
    }

    return this.maintainersRepo.listByCompany(companyId);
  }

  /**
   * Remove a maintainer.
   * Only admins can remove maintainers.
   */
  async removeMaintainer(
    companyId: string,
    adminEmail: string,
    maintainerId: string,
  ): Promise<void> {
    const isAdmin = await this.maintainersRepo.isAdminForCompany(companyId, adminEmail);
    if (!isAdmin) {
      throw new Error("Only company admins can remove maintainers");
    }

    const maintainer = await this.maintainersRepo.findById(maintainerId);
    if (!maintainer || maintainer.companyId !== companyId) {
      throw new Error("Maintainer not found");
    }

    // Prevent removing the last admin
    if (maintainer.role === "admin") {
      const allAdmins = (await this.maintainersRepo.listByCompany(companyId))
        .filter((m) => m.role === "admin");
      if (allAdmins.length <= 1) {
        throw new Error("Cannot remove the last admin");
      }
    }

    await this.maintainersRepo.delete(maintainerId);

    logger.info({ companyId, maintainerId }, "Maintainer removed");
  }

  /**
   * Check if a user has a specific permission level for a company.
   * Used as a guard in controllers/middleware.
   */
  async checkPermission(
    companyId: string,
    email: string,
    requiredRole: MaintainerRole,
  ): Promise<boolean> {
    return this.maintainersRepo.hasPermission(companyId, email, requiredRole);
  }
}