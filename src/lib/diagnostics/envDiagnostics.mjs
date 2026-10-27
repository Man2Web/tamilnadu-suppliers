// ============================================================================
// TAMILNADU SUPPLIERS - SAFE ENVIRONMENT DIAGNOSTICS
// Reports whether required variables are present and whether the Supabase URL and
// API keys belong to the same project. NEVER returns or logs a secret value: only
// booleans, key formats, roles and (public) project refs are reported.
// Shared by src/instrumentation.ts (startup log) and scripts/check-env.mjs (Coolify terminal).
// ============================================================================

export const ALLOWED_SUPABASE_PROJECT_REF = "lznyejowgqwbavtnqqns";

const REQUIRED = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SESSION_SECRET",
];

/** Decodes the (unsigned, non-secret) payload of a Supabase JWT-style key: { ref, role }. */
function inspectKey(key) {
  if (!key) return { format: "missing", role: null, ref: null };
  const value = key.trim();
  if (value.startsWith("sb_secret_")) return { format: "sb_secret", role: "service_role", ref: null };
  if (value.startsWith("sb_publishable_")) return { format: "sb_publishable", role: "anon", ref: null };
  const parts = value.split(".");
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
      return {
        format: "jwt",
        role: typeof payload.role === "string" ? payload.role : null,
        ref: typeof payload.ref === "string" ? payload.ref : null,
      };
    } catch {
      return { format: "malformed", role: null, ref: null };
    }
  }
  return { format: "unknown", role: null, ref: null };
}

function urlRef(url) {
  try {
    const host = new URL(url).hostname;
    const m = host.match(/^([a-z0-9]+)\.supabase\.co$/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/**
 * @param {Record<string, string | undefined>} env
 */
/** Same normalisation as cleanEnvValue() in src/lib/db/guard.ts. */
function clean(val) {
  if (!val) return "";
  let c = val.trim();
  if ((c.startsWith('"') && c.endsWith('"')) || (c.startsWith("'") && c.endsWith("'"))) c = c.slice(1, -1).trim();
  return c;
}

export function collectEnvDiagnostics(rawEnv = process.env) {
  const problems = [];
  const quoted = [];
  const env = {};
  for (const [name, value] of Object.entries(rawEnv)) {
    if (typeof value !== "string") continue;
    env[name] = clean(value);
    if (env[name] !== value.trim() || value !== value.trim()) quoted.push(name);
  }
  const rawProvider = (env.DB_PROVIDER || "").trim().toLowerCase();
  let provider = "supabase";
  let isPostgres = false;
  let postgresSummary = null;

  if (rawProvider && rawProvider !== "supabase" && rawProvider !== "postgres") {
    problems.push(`Invalid DB_PROVIDER='${rawProvider}'. Allowed values are 'supabase' (or unset) or 'postgres'.`);
  } else if (rawProvider === "postgres") {
    provider = "postgres";
    isPostgres = true;
  }

  // Determine required keys based on active provider
  const requiredKeys = isPostgres
    ? ["DATABASE_URL", "SESSION_SECRET"]
    : REQUIRED;

  for (const name of quoted) {
    if (requiredKeys.includes(name) || name === "TRUSTED_PROXY_COUNT" || name === "DB_PROVIDER") {
      problems.push(`${name} was saved with surrounding quotes/whitespace (the app strips them, but re-save it without quotes in Coolify).`);
    }
  }

  const present = {};
  for (const name of [...REQUIRED, "DATABASE_URL", "DB_PROVIDER"]) {
    present[name] = Boolean((env[name] || "").trim());
  }

  for (const name of requiredKeys) {
    if (!present[name]) problems.push(`${name} is not set in the running server.`);
  }

  if (isPostgres && present.DATABASE_URL) {
    const rawUrl = (env.DATABASE_URL || "").trim();
    if (!rawUrl.startsWith("postgres://") && !rawUrl.startsWith("postgresql://")) {
      problems.push("DATABASE_URL must start with 'postgres://' or 'postgresql://'.");
    } else {
      try {
        const parsed = new URL(rawUrl);
        const host = (parsed.hostname || "").toLowerCase();
        if (!host) {
          problems.push("DATABASE_URL is missing a valid hostname.");
        } else if (host.endsWith(".supabase.co") || host === "supabase.co" || host.includes("supabase") || rawUrl.includes(ALLOWED_SUPABASE_PROJECT_REF)) {
          problems.push("DATABASE_URL points to a Supabase host or project, which is rejected when DB_PROVIDER='postgres'.");
        } else {
          postgresSummary = {
            protocol: parsed.protocol.replace(/:$/, ""),
            host,
            port: parsed.port ? parseInt(parsed.port, 10) : 5432,
            database: (parsed.pathname || "").replace(/^\//, ""),
          };
        }
      } catch {
        problems.push("DATABASE_URL is not a well-formed PostgreSQL URL.");
      }
    }
  }

  const url = (env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const projectRef = url ? urlRef(url) : null;
  if (!isPostgres) {
    if (url && !projectRef) problems.push("NEXT_PUBLIC_SUPABASE_URL is not a https://<project-ref>.supabase.co URL.");
    if (projectRef && projectRef !== ALLOWED_SUPABASE_PROJECT_REF) {
      problems.push(`NEXT_PUBLIC_SUPABASE_URL points at project '${projectRef}', not the dedicated project '${ALLOWED_SUPABASE_PROJECT_REF}'.`);
    }
  }

  const service = inspectKey(env.SUPABASE_SERVICE_ROLE_KEY);
  const anon = inspectKey(env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  if (present.SUPABASE_SERVICE_ROLE_KEY) {
    if (service.format === "malformed" || service.format === "unknown") {
      problems.push("SUPABASE_SERVICE_ROLE_KEY is not a recognised Supabase key (check for truncation, quotes or whitespace).");
    }
    if (service.role && service.role !== "service_role") {
      problems.push(`SUPABASE_SERVICE_ROLE_KEY holds a '${service.role}' key, not the service_role key.`);
    }
    if (service.ref && projectRef && service.ref !== projectRef) {
      problems.push(`SUPABASE_SERVICE_ROLE_KEY belongs to project '${service.ref}' but the URL is project '${projectRef}'. (This produces "Invalid API key".)`);
    }
  }
  if (present.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    if (anon.role && anon.role !== "anon") problems.push(`NEXT_PUBLIC_SUPABASE_ANON_KEY holds a '${anon.role}' key; it must be the anon/public key.`);
    if (anon.ref && projectRef && anon.ref !== projectRef) {
      problems.push(`NEXT_PUBLIC_SUPABASE_ANON_KEY belongs to project '${anon.ref}' but the URL is project '${projectRef}'.`);
    }
  }
  if (env.NEXT_PUBLIC_SUPABASE_ANON_KEY && env.NEXT_PUBLIC_SUPABASE_ANON_KEY === env.SUPABASE_SERVICE_ROLE_KEY) {
    problems.push("SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_ANON_KEY are identical.");
  }
  if (env.SUPABASE_SERVICE_ROLE_KEY && /["'\s]/.test(env.SUPABASE_SERVICE_ROLE_KEY)) {
    problems.push("SUPABASE_SERVICE_ROLE_KEY contains embedded quotes or whitespace (re-paste it).");
  }

  const secret = (env.SESSION_SECRET || "").trim();
  let sessionSecret = "missing";
  if (secret) {
    const lower = secret.toLowerCase();
    const placeholder = ["change-this", "your-", "replace-me", "changeme"].some((m) => lower.includes(m));
    sessionSecret = secret.length >= 32 && !placeholder ? "ok" : "invalid";
    if (sessionSecret === "invalid") problems.push("SESSION_SECRET is too short (<32) or still a placeholder.");
  }

  const proxies = (env.TRUSTED_PROXY_COUNT || "0").trim();
  if (!/^\d{1,2}$/.test(proxies)) problems.push("TRUSTED_PROXY_COUNT must be a small integer (use 1 behind Coolify/Traefik).");

  return {
    nodeEnv: env.NODE_ENV || null,
    provider: {
      name: provider,
      raw: rawProvider || null,
      isPostgres,
      isSupabase: !isPostgres,
    },
    postgres: postgresSummary,
    present,
    supabase: {
      urlProjectRef: projectRef,
      serviceKey: { format: service.format, role: service.role, projectRef: service.ref },
      anonKey: { format: anon.format, role: anon.role, projectRef: anon.ref },
      // true/false when both refs are known, null when a key format carries no ref (sb_secret_...)
      serviceKeyMatchesUrl: service.ref && projectRef ? service.ref === projectRef : null,
      anonKeyMatchesUrl: anon.ref && projectRef ? anon.ref === projectRef : null,
    },
    sessionSecret,
    trustedProxyCount: /^\d{1,2}$/.test(proxies) ? Number(proxies) : null,
    problems,
  };
}
