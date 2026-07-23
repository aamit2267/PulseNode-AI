import { logger } from "../../lib/logger.js";
import admin from "firebase-admin";

let app: admin.app.App | null = null;

function getFirebaseApp(): admin.app.App {
  if (!app) {
    // Initialize Firebase Admin SDK
    // Support both full service account JSON and individual fields
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      app = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    } else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      // Use individual env vars (more common in .env files)
      app = admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
        }),
      });
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      // Use Application Default Credentials
      app = admin.initializeApp({
        credential: admin.credential.applicationDefault(),
      });
    } else {
      // For local development, use emulator or default credentials
      logger.warn("No Firebase credentials configured, using default");
      app = admin.initializeApp();
    }
  }
  return app;
}

export class FirebaseAuthClient {
  private auth: admin.auth.Auth;

  constructor() {
    const firebaseApp = getFirebaseApp();
    this.auth = firebaseApp.auth();
  }

  /**
   * Create a custom token for a user
   * @param uid - The user's unique identifier in our system
   * @param claims - Custom claims to include in the token
   */
  async createCustomToken(
    uid: string,
    claims: Record<string, unknown> = {},
  ): Promise<string> {
    // Firebase custom tokens require the uid to be a string
    // Add our custom claims
    const customClaims = {
      ...claims,
      // Standard claim for our user type
      "https://pulsenode.ai/user_type": claims.userType || "unknown",
    };

    try {
      logger.debug({ uid, claims: customClaims }, "Attempting to create custom token");
      const token = await this.auth.createCustomToken(uid, customClaims);
      logger.debug({ uid, claims: customClaims }, "Custom token created");
      return token;
    } catch (error) {
      logger.error({ uid, err: error, message: error instanceof Error ? error.message : String(error) }, "Failed to create custom token");
      throw new Error("Failed to create authentication token");
    }
  }

  /**
   * Verify a Firebase ID token (for server-side validation if needed)
   */
  async verifyIdToken(idToken: string): Promise<admin.auth.DecodedIdToken> {
    try {
      return await this.auth.verifyIdToken(idToken);
    } catch (error) {
      logger.error({ err: error }, "Failed to verify ID token");
      throw new Error("Invalid authentication token");
    }
  }

  /**
   * Revoke all refresh tokens for a user (logout everywhere)
   */
  async revokeRefreshTokens(uid: string): Promise<void> {
    try {
      await this.auth.revokeRefreshTokens(uid);
      logger.info({ uid }, "Refresh tokens revoked");
    } catch (error) {
      logger.error({ uid, err: error }, "Failed to revoke refresh tokens");
      throw new Error("Failed to revoke tokens");
    }
  }

  /**
   * Get user by UID
   */
  async getUser(uid: string): Promise<admin.auth.UserRecord> {
    return this.auth.getUser(uid);
  }

  /**
   * Delete a user from Firebase Auth
   */
  async deleteUser(uid: string): Promise<void> {
    await this.auth.deleteUser(uid);
    logger.info({ uid }, "Firebase user deleted");
  }

  /**
   * Update user in Firebase Auth (email, display name, etc.)
   */
  async updateUser(uid: string, properties: admin.auth.UpdateRequest): Promise<admin.auth.UserRecord> {
    return this.auth.updateUser(uid, properties);
  }
}

// Singleton instance
export const firebaseAuthClient = new FirebaseAuthClient();