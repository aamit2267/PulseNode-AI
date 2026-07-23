import { logger } from "../../lib/logger.js";
import { FirebaseAuthClient } from "./firebase-client.js";
import { TotpService } from "./totp.service.js";
import type { AuthRepository } from "./auth.repository.js";
import type { Employee, Doctor, AdminUser } from "./auth.repository.js";

export interface EmployeeAuthResult {
  employee: Employee;
  customToken: string;
  requiresTotp: boolean;
}

export interface DoctorAuthResult {
  doctor: Doctor;
  customToken: string;
  requiresTotp: boolean;
}

export interface AdminAuthResult {
  admin: AdminUser;
  customToken: string;
  requiresTotp: boolean;
}

export interface TotpSetupResult {
  secret: string;
  otpAuthUrl: string;
}

export class AuthService {
  constructor(
    private readonly repo: AuthRepository,
    private readonly firebase: FirebaseAuthClient,
    private readonly totp: TotpService,
  ) {}

  /**
   * Employee Login Flow:
   * 1. Verify corporate email exists in pre-provisioned employees table
   * 2. Check if company requires MFA
   * 3. If MFA required and user has verified TOTP, require TOTP code
   * 4. If MFA required but no TOTP setup, return setup info
   * 5. Generate Firebase custom token
   */
  async employeeLogin(
    email: string,
    totpCode?: string,
  ): Promise<
    | { type: "success"; data: EmployeeAuthResult }
    | { type: "totp_required"; setup?: TotpSetupResult; message: string }
    | { type: "error"; message: string }
  > {
    const normalizedEmail = email.toLowerCase().trim();

    // Step 1: Check if employee exists in pre-provisioned table
    logger.debug({ email: normalizedEmail }, "Looking up employee");
    const employee = await this.repo.findEmployeeByEmail(normalizedEmail);
    logger.debug({ employeeId: employee?.id, found: !!employee }, "Employee lookup result");
    if (!employee) {
      logger.warn({ email: normalizedEmail }, "Employee login: email not found");
      return { type: "error", message: "Corporate email not registered" };
    }

    if (employee.status !== "active") {
      return { type: "error", message: "Account is inactive" };
    }

    // Step 2: Get company to check MFA requirement
    // For now, we'll need to fetch company - let's add that to repo or handle here
    // TODO: Add company lookup to repo
    // For now, we'll assume we can get MFA requirement from company
    // We'll need to fetch company separately

    // Step 3: Check if TOTP is required
    const totpSecret = await this.repo.findTotpSecret(employee.id, "employee");
    const requiresTotp = totpSecret?.isVerified ?? false;

    // If TOTP required but not provided, or provided but invalid
    if (requiresTotp) {
      if (!totpCode) {
        return { type: "totp_required", message: "TOTP code required" };
      }

      const isValid = this.totp.verify(totpSecret.secret, totpCode);
      if (!isValid) {
        logger.warn({ employeeId: employee.id }, "Invalid TOTP code");
        return { type: "error", message: "Invalid TOTP code" };
      }
    } else if (totpSecret && !totpSecret.isVerified) {
      // TOTP setup in progress - user needs to verify
      return {
        type: "totp_required",
        setup: {
          secret: totpSecret.secret,
          otpAuthUrl: this.totp.getOtpAuthUrl(normalizedEmail, totpSecret.secret),
        },
        message: "Please complete TOTP setup",
      };
    }

    // Step 4: Generate Firebase custom token
    logger.debug({ employeeId: employee.id, companyId: employee.companyId }, "Generating custom token");
    const customToken = await this.firebase.createCustomToken(employee.id, {
      userType: "employee",
      companyId: employee.companyId,
      email: employee.corporateEmail,
    });

    logger.info({ employeeId: employee.id }, "Employee login successful");
    return {
      type: "success",
      data: {
        employee,
        customToken,
        requiresTotp,
      },
    };
  }

  /**
   * Employee TOTP Setup - initiate TOTP enrollment
   */
  async employeeTotpSetup(employeeId: string): Promise<TotpSetupResult> {
    const employee = await this.repo.findEmployeeById(employeeId);
    if (!employee) {
      throw new Error("Employee not found");
    }

    const existing = await this.repo.findTotpSecret(employeeId, "employee");
    if (existing?.isVerified) {
      throw new Error("TOTP already configured");
    }

    const secret = this.totp.generateSecret();
    const otpAuthUrl = this.totp.getOtpAuthUrl(
      employee.corporateEmail,
      secret,
      "PulseNode.ai",
    );

    if (existing) {
      // Update existing unverified secret
      await this.repo.deleteTotpSecret(employeeId, "employee");
    }

    await this.repo.createTotpSecret({
      userId: employeeId,
      userType: "employee",
      secret,
    });

    logger.info({ employeeId }, "TOTP setup initiated");
    return { secret, otpAuthUrl };
  }

  /**
   * Employee TOTP Verify - complete TOTP enrollment
   */
  async employeeTotpVerify(
    employeeId: string,
    totpCode: string,
  ): Promise<{ verified: boolean }> {
    const secret = await this.repo.findTotpSecret(employeeId, "employee");
    if (!secret) {
      throw new Error("No TOTP setup in progress");
    }

    const isValid = this.totp.verify(secret.secret, totpCode);
    if (!isValid) {
      return { verified: false };
    }

    await this.repo.verifyTotpSecret(employeeId, "employee");
    logger.info({ employeeId }, "TOTP verified");
    return { verified: true };
  }

  /**
   * Doctor Signup Flow:
   * 1. Doctor signs up via Firebase (Google Auth or email/password)
   * 2. Backend creates doctor record with status='pending'
   * 3. Platform admin must approve before doctor can be booked
   */
  async doctorSignup(data: {
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
    // Check if doctor already exists
    const existingByFirebase = await this.repo.findDoctorByFirebaseUid(data.firebaseUid);
    if (existingByFirebase) {
      throw new Error("Doctor already registered with this Firebase account");
    }

    const existingByEmail = await this.repo.findDoctorByEmail(data.email);
    if (existingByEmail) {
      throw new Error("Doctor already registered with this email");
    }

    // Validate consultation modes
    const validModes = ["online", "offline", "both"];
    if (!data.consultationModes.every((m) => validModes.includes(m))) {
      throw new Error("Invalid consultation mode");
    }

    // If offline mode, clinic address is required
    if (
      (data.consultationModes.includes("offline") ||
        data.consultationModes.includes("both")) &&
      !data.clinicAddress
    ) {
      throw new Error("Clinic address required for offline consultations");
    }

    const doctor = await this.repo.createDoctor({
      ...data,
      email: data.email.toLowerCase(),
    });

    logger.info({ doctorId: doctor.id, email: doctor.email }, "Doctor signup - pending approval");
    return doctor;
  }

  /**
   * Doctor Login Flow:
   * 1. Verify doctor exists and is approved
   * 2. Check TOTP if required (doctors can optionally enable 2FA)
   * 3. Generate Firebase custom token
   */
  async doctorLogin(
    email: string,
    totpCode?: string,
  ): Promise<
    | { type: "success"; data: DoctorAuthResult }
    | { type: "totp_required"; setup?: TotpSetupResult; message: string }
    | { type: "error"; message: string }
    | { type: "pending_approval"; message: string }
  > {
    const normalizedEmail = email.toLowerCase().trim();

    const doctor = await this.repo.findDoctorByEmail(normalizedEmail);
    if (!doctor) {
      return { type: "error", message: "Doctor not found" };
    }

    if (doctor.status === "pending") {
      return { type: "pending_approval", message: "Account pending platform admin approval" };
    }

    if (doctor.status === "suspended") {
      return { type: "error", message: "Account suspended" };
    }

    // Check TOTP
    const totpSecret = await this.repo.findTotpSecret(doctor.id, "doctor");
    const requiresTotp = totpSecret?.isVerified ?? false;

    if (requiresTotp) {
      if (!totpCode) {
        return { type: "totp_required", message: "TOTP code required" };
      }
      const isValid = this.totp.verify(totpSecret.secret, totpCode);
      if (!isValid) {
        return { type: "error", message: "Invalid TOTP code" };
      }
    } else if (totpSecret && !totpSecret.isVerified) {
      return {
        type: "totp_required",
        setup: {
          secret: totpSecret.secret,
          otpAuthUrl: this.totp.getOtpAuthUrl(normalizedEmail, totpSecret.secret),
        },
        message: "Please complete TOTP setup",
      };
    }

    const customToken = await this.firebase.createCustomToken(doctor.id, {
      userType: "doctor",
      email: doctor.email,
    });

    logger.info({ doctorId: doctor.id }, "Doctor login successful");
    return {
      type: "success",
      data: { doctor, customToken, requiresTotp },
    };
  }

  /**
   * Doctor TOTP Setup
   */
  async doctorTotpSetup(doctorId: string): Promise<TotpSetupResult> {
    const doctor = await this.repo.findDoctorById(doctorId);
    if (!doctor) throw new Error("Doctor not found");

    const existing = await this.repo.findTotpSecret(doctorId, "doctor");
    if (existing?.isVerified) throw new Error("TOTP already configured");

    const secret = this.totp.generateSecret();
    const otpAuthUrl = this.totp.getOtpAuthUrl(doctor.email, secret, "PulseNode.ai");

    if (existing) {
      await this.repo.deleteTotpSecret(doctorId, "doctor");
    }

    await this.repo.createTotpSecret({ userId: doctorId, userType: "doctor", secret });
    return { secret, otpAuthUrl };
  }

  async doctorTotpVerify(doctorId: string, totpCode: string): Promise<{ verified: boolean }> {
    const secret = await this.repo.findTotpSecret(doctorId, "doctor");
    if (!secret) throw new Error("No TOTP setup in progress");

    const isValid = this.totp.verify(secret.secret, totpCode);
    if (!isValid) return { verified: false };

    await this.repo.verifyTotpSecret(doctorId, "doctor");
    return { verified: true };
  }

  /**
   * Admin Login (Platform Admin or Company Admin)
   * Manually provisioned by platform owner
   */
  async adminLogin(
    email: string,
    totpCode?: string,
  ): Promise<
    | { type: "success"; data: AdminAuthResult }
    | { type: "totp_required"; setup?: TotpSetupResult; message: string }
    | { type: "error"; message: string }
  > {
    const normalizedEmail = email.toLowerCase().trim();

    const admin = await this.repo.findAdminByEmail(normalizedEmail);
    if (!admin) {
      return { type: "error", message: "Admin not found" };
    }

    // Check TOTP (admins should always have 2FA enabled ideally)
    const totpSecret = await this.repo.findTotpSecret(admin.id, "admin");
    const requiresTotp = totpSecret?.isVerified ?? false;

    if (requiresTotp) {
      if (!totpCode) {
        return { type: "totp_required", message: "TOTP code required" };
      }
      const isValid = this.totp.verify(totpSecret.secret, totpCode);
      if (!isValid) {
        return { type: "error", message: "Invalid TOTP code" };
      }
    } else if (totpSecret && !totpSecret.isVerified) {
      return {
        type: "totp_required",
        setup: {
          secret: totpSecret.secret,
          otpAuthUrl: this.totp.getOtpAuthUrl(normalizedEmail, totpSecret.secret, "PulseNode.ai"),
        },
        message: "Please complete TOTP setup",
      };
    }

    const customToken = await this.firebase.createCustomToken(admin.id, {
      userType: "admin",
      role: admin.role,
      companyId: admin.companyId,
    });

    logger.info({ adminId: admin.id, role: admin.role }, "Admin login successful");
    return {
      type: "success",
      data: { admin, customToken, requiresTotp },
    };
  }

  async adminTotpSetup(adminId: string): Promise<TotpSetupResult> {
    const admin = await this.repo.findAdminById(adminId);
    if (!admin) throw new Error("Admin not found");

    const existing = await this.repo.findTotpSecret(adminId, "admin");
    if (existing?.isVerified) throw new Error("TOTP already configured");

    const secret = this.totp.generateSecret();
    const otpAuthUrl = this.totp.getOtpAuthUrl(admin.email, secret, "PulseNode.ai");

    if (existing) {
      await this.repo.deleteTotpSecret(adminId, "admin");
    }

    await this.repo.createTotpSecret({ userId: adminId, userType: "admin", secret });
    return { secret, otpAuthUrl };
  }

  async adminTotpVerify(adminId: string, totpCode: string): Promise<{ verified: boolean }> {
    const secret = await this.repo.findTotpSecret(adminId, "admin");
    if (!secret) throw new Error("No TOTP setup in progress");

    const isValid = this.totp.verify(secret.secret, totpCode);
    if (!isValid) return { verified: false };

    await this.repo.verifyTotpSecret(adminId, "admin");
    return { verified: true };
  }

  /**
   * Platform Admin: Create company admin user
   */
  async createCompanyAdmin(data: {
    firebaseUid: string;
    email: string;
    name: string;
    companyId: string;
  }): Promise<AdminUser> {
    const existing = await this.repo.findAdminByEmail(data.email);
    if (existing) throw new Error("Admin with this email already exists");

    const existingFirebase = await this.repo.findAdminByFirebaseUid(data.firebaseUid);
    if (existingFirebase) throw new Error("Firebase UID already linked");

    // TODO: verify company exists

    const admin = await this.repo.createAdminUser({
      ...data,
      email: data.email.toLowerCase(),
      role: "company_admin",
    });

    logger.info({ adminId: admin.id, companyId: data.companyId }, "Company admin created");
    return admin;
  }

  /**
   * Platform Admin: Create platform admin user
   */
  async createPlatformAdmin(data: {
    firebaseUid: string;
    email: string;
    name: string;
  }): Promise<AdminUser> {
    const existing = await this.repo.findAdminByEmail(data.email);
    if (existing) throw new Error("Admin with this email already exists");

    const admin = await this.repo.createAdminUser({
      ...data,
      email: data.email.toLowerCase(),
      role: "platform_admin",
    });

    logger.info({ adminId: admin.id }, "Platform admin created");
    return admin;
  }
}