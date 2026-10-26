// ============================================================================
// TAMILNADU SUPPLIERS - SERVER AUTHORIZATION & PERMISSION GUARDS
// Server-side session verification, role enforcement & permission checking
// ============================================================================

import { NextResponse } from "next/server";
import store from "@/lib/db/store";
import { ModulePermissionId, checkUserPermission } from "@/lib/types/permissions";
import { SESSION_COOKIE_NAME, verifySessionToken } from "./session";

export interface RequestActor {
  id?: string | null;
  userId: string | null;
  name?: string | null;
  username?: string | null;
  role: string;
  sessionId?: string | null;
  isSessionRejected?: boolean;
  user: any | null;
  isAuthenticated: boolean;
  hasPermission: (permission: ModulePermissionId | string) => boolean;
}

/**
 * Parses cookies from standard Cookie header string.
 */
function parseCookies(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {};
  const cookies: Record<string, string> = {};
  cookieHeader.split(";").forEach((cookie) => {
    const [name, ...val] = cookie.trim().split("=");
    if (name) {
      cookies[name] = decodeURIComponent(val.join("="));
    }
  });
  return cookies;
}

/**
 * Extracts and verifies the authenticated user actor from incoming HTTP request.
 * Identity comes ONLY from the signed HttpOnly session cookie, re-validated against the database.
 * Client-supplied identity headers (x-user-id / x-user-role) are never trusted.
 */
export async function getActorFromRequestAsync(req: Request): Promise<RequestActor> {
  const cookieHeader = req.headers.get("cookie");
  const cookies = parseCookies(cookieHeader);
  const sessionToken = cookies[SESSION_COOKIE_NAME];

  if (sessionToken) {
    const payload = await verifySessionToken(sessionToken);
    if (payload && payload.sub) {
      // Fail-closed session verification: session must exist and have "ACTIVE" status
      if (payload.sid) {
        const currentSession = await store.getSession(payload.sid);
        if (!currentSession || currentSession.status !== "ACTIVE") {
          const isRejected = currentSession?.status === "REJECTED";
          return {
            id: payload.sub,
            userId: payload.sub,
            name: currentSession?.userName || null,
            username: currentSession?.username || null,
            role: payload.role || currentSession?.role || "GUEST",
            sessionId: payload.sid,
            isSessionRejected: isRejected,
            user: null,
            isAuthenticated: false,
            hasPermission: () => false,
          };
        }
        await store.touchSession(payload.sid);
      }

      const user = await store.getUser(payload.sub);
      if (user && user.status === "ACTIVE") {
        return {
          id: user.id,
          userId: user.id,
          name: user.name,
          username: user.username || user.email,
          role: user.role,
          sessionId: payload.sid || null,
          isSessionRejected: false,
          user,
          isAuthenticated: true,
          hasPermission: (permission: ModulePermissionId | string) => {
            if (user.status !== "ACTIVE") return false;
            if (user.role === "SUPER_ADMIN") return true;
            return checkUserPermission(user, permission);
          },
        };
      }
    }
  }

  // Unauthenticated actor
  return {
    id: null,
    userId: null,
    role: "GUEST",
    user: null,
    isAuthenticated: false,
    hasPermission: () => false,
  };
}

/**
 * Permission Guard: Returns 401 if unauthenticated, 403 if unauthorized, or null if permitted.
 */
export async function checkPermissionGuardAsync(
  req: Request,
  requiredPermission: ModulePermissionId | string
): Promise<NextResponse | null> {
  const actor = await getActorFromRequestAsync(req);

  if (actor.isSessionRejected) {
    return NextResponse.json(
      {
        error: "Your session has been terminated by the Super Admin.",
        code: "SESSION_REJECTED",
      },
      { status: 401 }
    );
  }

  if (!actor.isAuthenticated) {
    return NextResponse.json(
      {
        error: "Unauthorized: Authentication required. Please log in.",
        code: "UNAUTHENTICATED",
      },
      { status: 401 }
    );
  }

  if (!actor.hasPermission(requiredPermission)) {
    return NextResponse.json(
      {
        error: `Forbidden: Account does not have permission '${requiredPermission}' to perform this action.`,
        code: "PERMISSION_DENIED",
      },
      { status: 403 }
    );
  }

  return null;
}

/**
 * Any-of permission guard: permits the request if the actor holds at least one of the listed
 * permissions (used where several existing workflows legitimately read the same data).
 */
export async function checkAnyPermissionGuardAsync(
  req: Request,
  permissions: (ModulePermissionId | string)[]
): Promise<NextResponse | null> {
  const actor = await getActorFromRequestAsync(req);
  const unauth = unauthenticatedResponse(actor);
  if (unauth) return unauth;
  if (permissions.some((p) => actor.hasPermission(p))) return null;
  return NextResponse.json(
    { error: "Forbidden: Account does not have permission to perform this action.", code: "PERMISSION_DENIED" },
    { status: 403 }
  );
}

/**
 * Authenticated-only guard (any active role).
 */
export async function requireAuthenticatedAsync(req: Request): Promise<NextResponse | null> {
  const actor = await getActorFromRequestAsync(req);
  return unauthenticatedResponse(actor);
}

/**
 * Super Admin guard based on the server-verified role (database user, not request headers).
 */
export async function requireSuperAdminAsync(req: Request): Promise<NextResponse | null> {
  const actor = await getActorFromRequestAsync(req);
  const unauth = unauthenticatedResponse(actor);
  if (unauth) return unauth;
  if (actor.role !== "SUPER_ADMIN") {
    return NextResponse.json(
      { error: "Forbidden: Super Admin access required.", code: "PERMISSION_DENIED" },
      { status: 403 }
    );
  }
  return null;
}

function unauthenticatedResponse(actor: RequestActor): NextResponse | null {
  if (actor.isSessionRejected) {
    return NextResponse.json(
      { error: "Your session has been terminated by the Super Admin.", code: "SESSION_REJECTED" },
      { status: 401 }
    );
  }
  if (!actor.isAuthenticated) {
    return NextResponse.json(
      { error: "Unauthorized: Authentication required. Please log in.", code: "UNAUTHENTICATED" },
      { status: 401 }
    );
  }
  return null;
}
