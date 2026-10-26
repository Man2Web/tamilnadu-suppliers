// ============================================================================
// TAMILNADU SUPPLIERS - SECURE SESSION & JWT MANAGEMENT
// Signed HttpOnly Session Cookie Token Creation and Verification
// ============================================================================

import { SignJWT, jwtVerify } from "jose";
import { User, UserRole } from "@/lib/types";
import { cleanEnvValue } from "@/lib/db/guard";

export const SESSION_COOKIE_NAME = "tns_session";

export interface SessionPayload {
  sub: string;
  email: string;
  name: string;
  role: UserRole;
  sid?: string;
  mustChangePassword?: boolean;
  iat?: number;
  exp?: number;
}

const MIN_SECRET_LENGTH = 32;
const PLACEHOLDER_MARKERS = ["change-this", "your-", "replace-me", "changeme"];

let cachedSecret: Uint8Array | null = null;
let cachedSecretSource: string | null = null;

/**
 * Resolves the signing secret from SESSION_SECRET only. There is deliberately no
 * built-in fallback: a missing, short, or placeholder secret is a configuration
 * error in every environment, and the secret value is never logged.
 */
export function getSessionSecret(): Uint8Array {
  const raw = cleanEnvValue(process.env.SESSION_SECRET);

  if (cachedSecret && cachedSecretSource === raw) return cachedSecret;

  const lower = raw.toLowerCase();
  if (!raw) {
    throw new Error(
      "[CONFIG] SESSION_SECRET is not set. Generate one with: " +
        "node -e \"console.log(require('crypto').randomBytes(48).toString('base64url'))\" " +
        "and set it in .env.local (development) or the server environment (production)."
    );
  }
  if (raw.length < MIN_SECRET_LENGTH || PLACEHOLDER_MARKERS.some((m) => lower.includes(m))) {
    throw new Error(
      `[CONFIG] SESSION_SECRET is invalid: it must be a random value of at least ${MIN_SECRET_LENGTH} characters and not a placeholder.`
    );
  }

  cachedSecret = new TextEncoder().encode(raw);
  cachedSecretSource = raw;
  return cachedSecret;
}

/**
 * Creates a cryptographically signed JWT session token.
 */
export async function createSessionToken(user: User, sessionId?: string): Promise<string> {
  const payload: SessionPayload = {
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    sid: sessionId || crypto.randomUUID(),
    mustChangePassword: !!user.mustChangePassword,
  };

  return await new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSessionSecret());
}

/**
 * Verifies a JWT session token and returns decoded payload, or null if invalid/expired.
 */
export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  if (!token) return null;
  // A missing/invalid secret must surface as a configuration error, not as "logged out".
  const secret = getSessionSecret();
  try {
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ["HS256"],
    });
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

/**
 * Standard cookie configuration for HttpOnly session security.
 */
export const SESSION_COOKIE_OPTIONS = {
  name: SESSION_COOKIE_NAME,
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
};
