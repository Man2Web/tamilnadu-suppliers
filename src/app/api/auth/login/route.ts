// ============================================================================
// TAMILNADU SUPPLIERS - SECURE LOGIN API ROUTE
// Brute-force rate limiting, bcrypt verification, signed HttpOnly session cookie
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import store from "@/lib/db/store";
import { checkRateLimit, recordFailedAttempt, clearRateLimit } from "@/lib/auth/rateLimit";
import { getTrustedClientIp } from "@/lib/auth/clientIp";
import { classifyLoginFailure } from "@/lib/auth/loginDiagnostics";
import { createSessionToken, SESSION_COOKIE_OPTIONS, isCookieSecureForRequest } from "@/lib/auth/session";

export async function POST(req: NextRequest) {
  try {
    // Null unless TRUSTED_PROXY_COUNT is configured: forwarded headers are otherwise client-controlled
    const trustedIp = getTrustedClientIp(req);
    const ip = trustedIp || "unknown";
    const body = await req.json().catch(() => ({}));
    const username = (body.username || body.email || "").toString().trim();
    const password = (body.password || "").toString().trim();

    // Basic payload validation
    if (!username || !password) {
      console.warn(`[login:request-validation] Missing ${!username ? "username" : "password"} (ip: ${ip})`);
      return NextResponse.json(
        { error: "Invalid username or password." },
        { status: 400 }
      );
    }

    // Rate-limiting check against brute-force attacks
    const rateLimitCheck = await checkRateLimit(trustedIp, username);
    if (rateLimitCheck.isBlocked) {
      console.warn(
        `[login:rate-limiting] Blocked user '${username}' (ip: ${ip}, retryAfterMinutes: ${rateLimitCheck.retryAfterMinutes})`
      );
      return NextResponse.json(
        {
          error: `Too many failed login attempts. Please try again in ${rateLimitCheck.retryAfterMinutes} minutes.`,
          code: "RATE_LIMITED",
        },
        {
          status: 429,
          headers: {
            "Retry-After": String((rateLimitCheck.retryAfterMinutes || 15) * 60),
          },
        }
      );
    }

    // Verify credentials asynchronously via strong password hash
    const user = await store.verifyCredentialsAsync(username, password);

    if (!user) {
      console.warn(`[login:credential-verification] Failed for user '${username}' (ip: ${ip})`);
      await recordFailedAttempt(trustedIp, username);
      // Record audit log for failed login attempt (do not disclose secrets or password)
      await store.recordAuditLog({
        entityType: "ACCOUNT",
        entityId: username || "unknown",
        entityNumber: username,
        customerName: null,
        action: "FAILED_LOGIN",
        actionLabel: "Failed Sign-In Attempt",
        actor: {
          id: "system",
          name: username || "Unknown User",
          username: username || "unknown",
          role: "GUEST",
        },
        details: {
          summary: `Failed login attempt for username '${username}'`,
          attemptedUsername: username,
          ipAddress: ip,
        },
        ipAddress: ip,
      });

      // Strictly generic error message — do not disclose whether user exists
      return NextResponse.json(
        { error: "Invalid username or password." },
        { status: 401 }
      );
    }

    // Successful authentication — reset rate-limit tracker
    await clearRateLimit(trustedIp, username);

    // Create server-side session
    let session;
    try {
      session = await store.createSession({
        userId: user.id,
        userName: user.name,
        username: user.username || user.email,
        role: user.role,
        ipAddress: ip,
        userAgent: req.headers.get("user-agent") || undefined,
      });
    } catch (sessionErr: unknown) {
      console.error(`[login:session-creation] Failed for user '${user.username || user.email}'`);
      throw sessionErr;
    }

    // Create cryptographically signed JWT session token with session ID (sid)
    let token: string;
    try {
      token = await createSessionToken(user, session.id);
    } catch (tokenErr: unknown) {
      console.error(`[login:cookie-setup] Session token signing failed`);
      throw tokenErr;
    }

    // Record audit log for successful sign-in
    await store.recordAuditLog({
      entityType: "ACCOUNT",
      entityId: user.id,
      entityNumber: user.username || user.email,
      customerName: user.name,
      action: "SIGN_IN",
      actionLabel: "Successful Sign-In",
      actor: {
        id: user.id,
        name: user.name,
        username: user.username || user.email,
        role: user.role,
      },
      details: {
        summary: `${user.name} (${user.role}) signed in successfully`,
        sessionId: session.id,
        ipAddress: ip,
      },
      ipAddress: ip,
    });

    // In-app notification for Super Admin whenever an Admin or Billing account signs in
    if (user.role === "ADMIN" || user.role === "BILLING") {
      await store.createNotification({
        type: "SIGN_IN",
        userId: user.id,
        sessionId: session.id,
        ipAddress: ip,
      });
    }

    // Build response with sanitized user data
    const response = NextResponse.json({
      success: true,
      sessionId: session.id,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        mustChangePassword: !!user.mustChangePassword,
      },
    });

    // Set HttpOnly session cookie (Secure on HTTPS, adaptable for plain HTTP/IP access)
    try {
      response.cookies.set({
        ...SESSION_COOKIE_OPTIONS,
        secure: isCookieSecureForRequest(req),
        value: token,
      });
    } catch (cookieErr: unknown) {
      console.error(`[login:cookie-setup] Cookie serialization failed`);
      throw cookieErr;
    }

    return response;
  } catch (err: unknown) {
    // Every failure gets a distinct, safe client code plus a sanitized server log line.
    // Rate-limit store failures still fail CLOSED (no session is ever issued).
    const failure = classifyLoginFailure(err);
    console.error(`[login] ${failure.code}: ${failure.logDetail}`);
    return NextResponse.json(
      { error: failure.clientMessage, code: failure.code },
      { status: failure.status }
    );
  }
}
