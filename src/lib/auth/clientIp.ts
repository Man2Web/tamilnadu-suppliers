// ============================================================================
// TAMILNADU SUPPLIERS - TRUSTED CLIENT IP RESOLUTION
// Forwarded-IP headers are client-controlled unless they were appended by a
// proxy we operate. They are therefore ignored unless TRUSTED_PROXY_COUNT is set.
// ============================================================================

/**
 * TRUSTED_PROXY_COUNT = number of reverse proxies you operate in front of the app
 * (e.g. 1 for nginx). 0 / unset = do not trust any forwarded header.
 */
export function getTrustedProxyCount(): number {
  const raw = (process.env.TRUSTED_PROXY_COUNT || "0").trim();
  if (!/^\d{1,2}$/.test(raw)) {
    throw new Error("[CONFIG] TRUSTED_PROXY_COUNT must be a small non-negative integer (e.g. 0 or 1).");
  }
  return Number(raw);
}

function looksLikeIp(value: string): boolean {
  return /^[0-9a-fA-F:.]{2,45}$/.test(value);
}

/**
 * Returns the client IP, or null when it cannot be determined from a trusted proxy.
 * With N trusted proxies, the client is the Nth entry from the right of X-Forwarded-For
 * (entries to its left may be forged by the client and are ignored).
 */
export function getTrustedClientIp(req: Request): string | null {
  const proxies = getTrustedProxyCount();
  if (proxies === 0) return null;

  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded.split(",").map((p) => p.trim()).filter(Boolean);
    const candidate = parts[parts.length - proxies];
    if (candidate && looksLikeIp(candidate)) return candidate;
  }
  return null;
}
