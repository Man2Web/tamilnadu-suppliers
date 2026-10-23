// ============================================================================
// TAMILNADU SUPPLIERS - SETUP STATUS API ROUTE
// Checks if Super Admin account has been securely provisioned
// ============================================================================

import { NextResponse } from "next/server";
import store from "@/lib/db/store";

export async function GET() {
  const isInitialized = await store.isSuperAdminInitialized();
  return NextResponse.json({
    initialized: isInitialized,
  });
}
