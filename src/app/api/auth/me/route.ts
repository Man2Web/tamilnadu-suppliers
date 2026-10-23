// ============================================================================
// TAMILNADU SUPPLIERS - CURRENT AUTHENTICATED USER ROUTE
// Returns authenticated user details and active role permissions
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { getActorFromRequestAsync } from "@/lib/auth/serverAuth";

export async function GET(req: NextRequest) {
  try {
    const actor = await getActorFromRequestAsync(req);

    if (actor.isSessionRejected) {
      const response = NextResponse.json(
        {
          authenticated: false,
          isSessionRejected: true,
          error: "Your session has been terminated by the Super Admin.",
          code: "SESSION_REJECTED",
        },
        { status: 401 }
      );
      response.cookies.set({
        name: "ts_session_token",
        value: "",
        httpOnly: true,
        path: "/",
        maxAge: 0,
        expires: new Date(0),
      });
      return response;
    }

    if (!actor.isAuthenticated || !actor.user) {
      return NextResponse.json(
        {
          authenticated: false,
          user: null,
        },
        { status: 401 }
      );
    }

    return NextResponse.json({
      authenticated: true,
      user: {
        id: actor.user.id,
        name: actor.user.name,
        email: actor.user.email,
        phone: actor.user.phone,
        role: actor.user.role,
        status: actor.user.status,
        permissions: actor.user.permissions,
        mustChangePassword: !!actor.user.mustChangePassword,
      },
    });
  } catch (error: any) {
    console.error("GET /api/auth/me error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to resolve session." },
      { status: 500 }
    );
  }
}
