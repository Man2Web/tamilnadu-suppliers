// Runs once when the server starts. Logs a SAFE summary of the environment the server actually sees
// (names / formats / project refs only - never values), so misconfiguration is visible in Coolify's runtime logs.

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { collectEnvDiagnostics } = await import("./lib/diagnostics/envDiagnostics.mjs");

  // Literal accesses on purpose: this reads the same values (including any build-time inlined
  // NEXT_PUBLIC_* values) that the application code receives.
  const diagnostics = collectEnvDiagnostics({
    NODE_ENV: process.env.NODE_ENV,
    DB_PROVIDER: process.env.DB_PROVIDER,
    DATABASE_URL: process.env.DATABASE_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SESSION_SECRET: process.env.SESSION_SECRET,
    TRUSTED_PROXY_COUNT: process.env.TRUSTED_PROXY_COUNT,
  });

  console.log("[startup] environment check:", JSON.stringify({ ...diagnostics, problems: undefined }));
  for (const problem of diagnostics.problems) {
    console.error(`[startup] CONFIG PROBLEM: ${problem}`);
  }
}
