// ============================================================================
// TAMILNADU SUPPLIERS - SECURE LOGOUT API ROUTE
// Invalidates server session cookie and returns clean status
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import store from "@/lib/db/store";

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (token) {
      const payload = await verifySessionToken(token);
      if (payload) {
        if (payload.sid) {
          await store.markSessionSignedOut(payload.sid);
        }

        const user = payload.sub ? await store.getUser(payload.sub) : null;
        const actorName = user ? user.name : "Employee";
        const actorUsername = user ? (user.username || user.email) : "user";
        const actorRole = user ? user.role : payload.role || "BILLING";

        // Record audit log for normal sign-out
        await store.recordAuditLog({
          entityType: "ACCOUNT",
          entityId: payload.sub || "user",
          entityNumber: actorUsername,
          customerName: actorName,
          action: "SIGN_OUT",
          actionLabel: "User Sign-Out",
          actor: {
            id: payload.sub || "user",
            name: actorName,
            username: actorUsername,
            role: actorRole,
          },
          details: {
            summary: `${actorName} (${actorRole}) signed out`,
            sessionId: payload.sid || null,
          },
        });

        // Notify Super Admin if Admin or Billing account signs out
        if (payload.sub && (actorRole === "ADMIN" || actorRole === "BILLING")) {
          await store.createNotification({
            type: "SIGN_OUT",
            userId: payload.sub,
            sessionId: payload.sid || "session",
          });
        }
      }
    }
  } catch (err) {
    console.error("Error during session logout recording:", err);
  }

  const response = NextResponse.json({
    success: true,
    message: "Logged out successfully",
  });

  // Explicitly clear session cookie across root path
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  });

  return response;
}
