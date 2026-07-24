import { createCipheriv, createDecipheriv, randomBytes, scrypt } from "crypto";
import { promisify } from "util";
import { logger } from "./logger.js";

const scryptAsync = promisify(scrypt);

/**
 * Derives an encryption key from the master key using scrypt
 */
async function deriveKey(masterKey: string, salt: Buffer): Promise<Buffer> {
  return scryptAsync(masterKey, salt, 32) as Promise<Buffer>;
}

/**
 * Encrypts a plaintext string using AES-256-GCM
 * Returns base64 encoded string: salt:iv:authTag:ciphertext
 */
export async function encrypt(plaintext: string, masterKey?: string): Promise<string> {
  const key = masterKey || process.env.TOTP_ENCRYPTION_KEY;
  if (!key) {
    throw new Error("TOTP_ENCRYPTION_KEY environment variable not set");
  }

  const salt = randomBytes(16);
  const iv = randomBytes(12); // 96-bit IV for GCM
  const derivedKey = await deriveKey(key, salt);

  const cipher = createCipheriv("aes-256-gcm", derivedKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Format: salt:iv:authTag:ciphertext (all base64)
  return [
    salt.toString("base64"),
    iv.toString("base64"),
    authTag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

/**
 * Decrypts a string encrypted with encrypt()
 * Expects base64 encoded string: salt:iv:authTag:ciphertext
 */
export async function decrypt(encrypted: string, masterKey?: string): Promise<string> {
  const key = masterKey || process.env.TOTP_ENCRYPTION_KEY;
  if (!key) {
    throw new Error("TOTP_ENCRYPTION_KEY environment variable not set");
  }

  const parts = encrypted.split(":");
  if (parts.length !== 4) {
    throw new Error("Invalid encrypted format");
  }

  const [saltB64, ivB64, authTagB64, ciphertextB64] = parts;
  const salt = Buffer.from(saltB64, "base64");
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const ciphertext = Buffer.from(ciphertextB64, "base64");

  const derivedKey = await deriveKey(key, salt);

  const decipher = createDecipheriv("aes-256-gcm", derivedKey, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  return plaintext.toString("utf8");
}

/**
 * Validates that encryption/decryption works correctly
 */
export async function validateEncryption(): Promise<boolean> {
  try {
    const testSecret = "JBSWY3DPEHPK3PXP";
    const encrypted = await encrypt(testSecret);
    const decrypted = await decrypt(encrypted);
    return decrypted === testSecret;
  } catch (error) {
    logger.error({ err: error }, "Encryption validation failed");
    return false;
  }
}