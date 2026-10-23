// ============================================================================
// TAMILNADU SUPPLIERS - HIGH-PERFORMANCE DASHBOARD SUMMARY API
// Pre-aggregated metrics, operational workflow pipeline, single-roundtrip
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import store from "@/lib/db/store";
import { getActorFromRequestAsync, checkPermissionGuardAsync } from "@/lib/auth/serverAuth";

export async function GET(req: NextRequest) {
  const denied = await checkPermissionGuardAsync(req, "dashboard:view");
  if (denied) return denied;
  try {
    const actor = await getActorFromRequestAsync(req);
    if (!actor.isAuthenticated) {
      return NextResponse.json(
        { error: "Unauthorized: Authentication required." },
        { status: 401 }
      );
    }

    const summary = await store.getDashboardSummary();
    return NextResponse.json(summary, {
      headers: {
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
      },
    });
  } catch (error: any) {
    console.error("Dashboard summary error:", error);
    return NextResponse.json(
      { error: "Failed to generate dashboard summary" },
      { status: 500 }
    );
  }
}
