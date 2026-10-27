// ============================================================================
// TAMILNADU SUPPLIERS - LOGIN RESPONSE INTERPRETATION (browser + tests)
// Turns EVERY completed /api/auth/login response into a user-facing outcome, so the
// form can always stop its loading state and show an appropriate message.
// ============================================================================

export interface LoginUser {
  id?: string;
  name?: string;
  email?: string;
  role?: string;
  phone?: string;
  status?: string;
  permissions?: unknown;
  mustChangePassword?: boolean;
}

export type LoginOutcome =
  | { ok: true; user?: LoginUser }
  | { ok: false; message: string; code?: string };

const GENERIC_BAD_CREDENTIALS = "Invalid username or password.";

export async function interpretLoginResponse(res: Response): Promise<LoginOutcome> {
  let body: { error?: string; code?: string; user?: LoginUser } | null = null;
  try {
    body = await res.json();
  } catch {
    body = null; // HTML error page from a gateway, empty body, etc.
  }

  if (res.ok) return { ok: true, user: body?.user };

  const code = body?.code;
  const serverMessage = typeof body?.error === "string" && body.error ? body.error : undefined;

  switch (res.status) {
    case 400:
    case 401:
      // Genuine credential failure (the server answers with the same generic text for unknown user / wrong password)
      return { ok: false, code, message: serverMessage || GENERIC_BAD_CREDENTIALS };
    case 403:
      return { ok: false, code, message: serverMessage || "Access to sign-in was denied by the server. Please contact the administrator." };
    case 429:
      return { ok: false, code, message: serverMessage || "Too many failed login attempts. Please try again later." };
    case 502:
    case 503:
    case 504:
      return { ok: false, code, message: serverMessage || "The service is temporarily unavailable. Please try again shortly." };
    default:
      if (res.status >= 500) {
        return { ok: false, code, message: serverMessage || "A server error occurred while signing in. Please try again or contact the administrator." };
      }
      return { ok: false, code, message: serverMessage || `Unexpected response from the server (HTTP ${res.status}).` };
  }
}

export const COOKIE_NOT_STORED_MESSAGE =
  "Your credentials were accepted, but the browser did not keep the session cookie. " +
  "Open the site over HTTPS (secure cookies are not stored on plain http://) and try again.";

/**
 * After a successful login, confirms the browser actually stored the session cookie.
 * Returns true when the session is usable (200, or 403 PASSWORD_CHANGE_REQUIRED which still proves a valid cookie).
 */
export async function isSessionCookieStored(fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const res = await fetchImpl("/api/auth/me", { credentials: "include", cache: "no-store" });
    if (res.ok) return true;
    if (res.status === 403) {
      const body = await res.json().catch(() => null);
      return body?.code === "PASSWORD_CHANGE_REQUIRED";
    }
    return false;
  } catch {
    return true; // network hiccup: don't block a valid login on the check itself
  }
}
