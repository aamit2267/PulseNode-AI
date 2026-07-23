import { authenticator } from "otplib";
import type { TotpSecret } from "./auth.repository.js";
import type { AuthRepository } from "./auth.repository.js";

export interface TotpSetupResult {
  secret: string;
  otpauthUrl: string;
}

export class TotpService {
  constructor(private readonly authRepo: AuthRepository) {
    // Configure otplib options - use lowercase "sha1" for newer otplib versions
    authenticator.options = {
      digits: 6,
      step: 30,
      algorithm: "sha1",
    };
  }

  /**
   * Generate a new TOTP secret and OTPAuth URL for QR code
   */
  generateSecret(): string {
    return authenticator.generateSecret();
  }

  /**
   * Get OTPAuth URL for QR code generation
   */
  getOtpAuthUrl(email: string, secret: string, serviceName = "PulseNode.ai"): string {
    return authenticator.keyuri(email, serviceName, secret);
  }

  /**
   * Verify a TOTP token against a secret
   */
  verify(secret: string, token: string): boolean {
    return authenticator.verify({ token, secret });
  }

  /**
   * Store the TOTP secret (unverified) in the database
   */
  async storeSecret(
    userId: string,
    userType: "employee" | "doctor" | "admin",
    secret: string,
  ): Promise<TotpSecret> {
    return this.authRepo.createTotpSecret({ userId, userType, secret });
  }

  /**
   * Verify a TOTP token against stored secret
   */
  async verifyToken(
    userId: string,
    userType: "employee" | "doctor" | "admin",
    token: string,
  ): Promise<boolean> {
    const record = await this.authRepo.findTotpSecret(userId, userType);
    if (!record) return false;
    return this.verify(record.secret, token);
  }

  /**
   * Verify and mark TOTP as verified (after first successful verification)
   */
  async verifyAndMark(
    userId: string,
    userType: "employee" | "doctor" | "admin",
    token: string,
  ): Promise<boolean> {
    const record = await this.authRepo.findTotpSecret(userId, userType);
    if (!record) return false;

    const valid = this.verify(record.secret, token);
    if (valid && !record.isVerified) {
      await this.authRepo.verifyTotpSecret(userId, userType);
    }
    return valid;
  }

  /**
   * Check if user has verified 2FA enabled
   */
  async hasVerifiedTotp(
    userId: string,
    userType: "employee" | "doctor" | "admin",
  ): Promise<boolean> {
    const record = await this.authRepo.findTotpSecret(userId, userType);
    return record?.isVerified ?? false;
  }

  /**
   * Get the current TOTP token (for testing/debugging)
   */
  getCurrentToken(secret: string): string {
    return authenticator.generate(secret);
  }

  /**
   * Disable 2FA for a user
   */
  async disableTotp(
    userId: string,
    userType: "employee" | "doctor" | "admin",
  ): Promise<void> {
    await this.authRepo.deleteTotpSecret(userId, userType);
  }
}