// ============================================================================
// TAMILNADU SUPPLIERS - SECURE SUPABASE CLIENT CONFIGURATION
// Target Project Isolation Guard: lznyejowgqwbavtnqqns
// ============================================================================

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { verifyDatabaseTarget, ALLOWED_SUPABASE_PROJECT_ID } from "./guard";

let adminClientInstance: SupabaseClient | null = null;

/**
 * Returns a high-privilege server-side Supabase client using SUPABASE_SERVICE_ROLE_KEY.
 * Strictly forbidden on browser/client components.
 */
export function getSupabaseAdminClient(): SupabaseClient {
  if (typeof window !== "undefined") {
    throw new Error("[SECURITY CRITICAL] Service role client cannot be accessed in the browser!");
  }

  if (adminClientInstance) {
    return adminClientInstance;
  }

  // 1. Verify target safety & project isolation
  const targetCheck = verifyDatabaseTarget();
  if (!targetCheck.isSafe) {
    throw new Error(`[DATABASE TARGET VIOLATION] ${targetCheck.message}`);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error(
      "Supabase configuration missing! Ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set."
    );
  }

  adminClientInstance = createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return adminClientInstance;
}

/**
 * Returns standard client using NEXT_PUBLIC_SUPABASE_ANON_KEY.
 */
export function getSupabaseAnonClient(): SupabaseClient {
  const targetCheck = verifyDatabaseTarget();
  if (!targetCheck.isSafe) {
    throw new Error(`[DATABASE TARGET VIOLATION] ${targetCheck.message}`);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    throw new Error(
      "Supabase configuration missing! Ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set."
    );
  }

  return createClient(supabaseUrl, anonKey);
}
