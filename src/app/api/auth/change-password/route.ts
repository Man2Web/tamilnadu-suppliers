// ============================================================================
// TAMILNADU SUPPLIERS - PASSWORD UPDATE API ROUTE
// Enforces changing temporary password on first login & ongoing updates
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import store from "@/lib/db/store";
import { getActorFromRequestAsync } from "@/lib/auth/serverAuth";
import { createSessionToken, SESSION_COOKIE_OPTIONS, isCookieSecureForRequest } from "@/lib/auth/session";

export async function POST(req: NextRequest) {
  try {
    const actor = await getActorFromRequestAsync(req);

    if (!actor.isAuthenticated || !actor.userId) {
      return NextResponse.json(
        { error: "Unauthorized: You must be logged in to change your password." },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const currentPassword = (body.currentPassword || "").toString().trim();
    const newPassword = (body.newPassword || "").toString().trim();
    const confirmPassword = (body.confirmPassword || "").toString().trim();

    if (!currentPassword) {
      return NextResponse.json(
        { error: "Current password is required." },
        { status: 400 }
      );
    }

    if (!newPassword || newPassword.length < 6) {
      return NextResponse.json(
        { error: "New password must be at least 6 characters long." },
        { status: 400 }
      );
    }

    if (newPassword !== confirmPassword) {
      return NextResponse.json(
        { error: "New password and confirmation do not match." },
        { status: 400 }
      );
    }

    if (currentPassword === newPassword) {
      return NextResponse.json(
        { error: "New password must be different from the temporary password." },
        { status: 400 }
      );
    }

    // Attempt password change in store
    const result = await store.changePassword(actor.userId, currentPassword, newPassword);

    // Re-issue updated JWT session token with mustChangePassword = false
    const updatedToken = await createSessionToken(result.user);

    const response = NextResponse.json({
      success: true,
      message: "Password changed successfully.",
      user: {
        id: result.user.id,
        name: result.user.name,
        email: result.user.email,
        role: result.user.role,
        mustChangePassword: false,
      },
    });

    response.cookies.set({
      ...SESSION_COOKIE_OPTIONS,
      secure: isCookieSecureForRequest(req),
      value: updatedToken,
    });

    return response;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update password.";
    return NextResponse.json(
      { error: message },
      { status: 400 }
    );
  }
}
