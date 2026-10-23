// ============================================================================
// TAMILNADU SUPPLIERS - SUPABASE DATA ACCESS LAYER
// Supabase PostgreSQL is the SINGLE SOURCE OF TRUTH for all application data
// ============================================================================

import supabaseStore, { SupabaseStore } from "./supabaseStore";

export { supabaseStore, SupabaseStore };
export const store = supabaseStore;
export default supabaseStore;
