// ============================================================================
// TAMILNADU SUPPLIERS - SERVER PROXY AUTHENTICATION GUARD
// Enforces server-side authentication, route protection & first-login password change
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE_NAME } from "./lib/auth/session";

// Paths accessible without an active session
const PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/setup-status",
];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1. Bypass Next.js internal files, static assets, and favicons
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/static") ||
    pathname.includes(".") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  // 2. Extract and verify session token
  const sessionToken = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = sessionToken ? await verifySessionToken(sessionToken) : null;
  const isAuthenticated = !!session;

  const isPublicPath = PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(path + "/"));
  const isLoginPage = pathname === "/login";
  const isChangePasswordPage = pathname === "/change-password";
  const isApiRoute = pathname.startsWith("/api/");
  const isChangePasswordApi = pathname === "/api/auth/change-password";
  const isLogoutApi = pathname === "/api/auth/logout";

  // 3. Unauthenticated access handling
  if (!isAuthenticated) {
    // Allow public routes
    if (isPublicPath) {
      return NextResponse.next();
    }

    // Reject unauthenticated API calls with 401 JSON
    if (isApiRoute) {
      return NextResponse.json(
        {
          error: "Unauthorized: Authentication required. Please log in.",
          code: "UNAUTHENTICATED",
        },
        { status: 401 }
      );
    }

    // Redirect all protected pages (including '/') to /login
    const loginUrl = new URL("/login", req.url);
    if (pathname !== "/" && !isLoginPage) {
      loginUrl.searchParams.set("from", pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  // 4. Authenticated user handling
  // If user must change password on first login
  if (session?.mustChangePassword) {
    if (!isChangePasswordPage && !isChangePasswordApi && !isLogoutApi) {
      if (isApiRoute) {
        return NextResponse.json(
          {
            error: "Password change is required before accessing application features.",
            code: "PASSWORD_CHANGE_REQUIRED",
          },
          { status: 403 }
        );
      }
      return NextResponse.redirect(new URL("/change-password", req.url));
    }
    return NextResponse.next();
  }

  // If user already changed password but tries to visit /change-password directly without flag
  if (isChangePasswordPage && !session?.mustChangePassword) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  // If already authenticated and visits /login, redirect to /dashboard
  if (isLoginPage) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  // If root URL '/' is accessed while authenticated, redirect to /dashboard
  if (pathname === "/") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  // 5. Role and module access enforcement at middleware level for Super Admin pages
  if (pathname.startsWith("/companies") || pathname.startsWith("/admin/users")) {
    if (session?.role !== "SUPER_ADMIN") {
      // Forbidden for non-Super Admin
      return NextResponse.redirect(new URL("/dashboard?error=access_denied", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
