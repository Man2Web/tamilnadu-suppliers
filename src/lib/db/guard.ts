/**
 * Tamilnadu Suppliers - Database Isolation and Target Verification Guard
 *
 * Enforces strict isolation rules:
 * 1. Dedicated Supabase project ID: lznyejowgqwbavtnqqns
 * 2. Absolute ban on connecting to previous 'inventory' project (hdaljmhsdaxsebvrskkp)
 */

export const ALLOWED_SUPABASE_PROJECT_ID = "lznyejowgqwbavtnqqns";
export const FORBIDDEN_PROJECT_IDS = ["hdaljmhsdaxsebvrskkp"];

export interface DbTargetCheck {
  isSafe: boolean;
  projectId: string | null;
  targetUrl: string;
  isConfigured: boolean;
  message: string;
}

export function verifyDatabaseTarget(): DbTargetCheck {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const databaseUrl = process.env.DATABASE_URL || "";

  // 1. Check for forbidden legacy database identifiers
  for (const forbidden of FORBIDDEN_PROJECT_IDS) {
    if (supabaseUrl.includes(forbidden) || databaseUrl.includes(forbidden)) {
      throw new Error(
        `[CRITICAL SECURITY ALERT] Connection attempt blocked! The configuration points to forbidden legacy database '${forbidden}'. ` +
        `Only the dedicated Tamilnadu Suppliers project (${ALLOWED_SUPABASE_PROJECT_ID}) is authorized.`
      );
    }
  }

  // 2. Check if dedicated project is configured
  const hasDedicatedUrl = supabaseUrl.includes(ALLOWED_SUPABASE_PROJECT_ID);
  const hasDedicatedDb = databaseUrl.includes(ALLOWED_SUPABASE_PROJECT_ID);

  if (!hasDedicatedUrl && !hasDedicatedDb) {
    return {
      isSafe: false,
      projectId: null,
      targetUrl: supabaseUrl,
      isConfigured: false,
      message: `Database URL is not pointing to dedicated project (${ALLOWED_SUPABASE_PROJECT_ID}). Found: ${supabaseUrl || "empty"}`
    };
  }

  const isConfigured = Boolean(
    (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) ||
    databaseUrl
  );

  return {
    isSafe: true,
    projectId: ALLOWED_SUPABASE_PROJECT_ID,
    targetUrl: supabaseUrl,
    isConfigured,
    message: `Verified safe target: ${ALLOWED_SUPABASE_PROJECT_ID}. Configured: ${isConfigured}`
  };
}
