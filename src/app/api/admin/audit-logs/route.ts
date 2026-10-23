import { NextResponse } from "next/server";
import store from "@/lib/db/store";
import { getActorFromRequestAsync } from "@/lib/auth/serverAuth";

export async function GET(req: Request) {
  const actor = await getActorFromRequestAsync(req);
  if (!actor.isAuthenticated) {
    return NextResponse.json(
      { error: "Unauthorized: Authentication required." },
      { status: 401 }
    );
  }

  if (actor.role !== "SUPER_ADMIN") {
    return NextResponse.json(
      { error: "Forbidden: Super Admin access required to view complete system audit logs." },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(req.url);
  const entityType = searchParams.get("entityType") || undefined;
  const entityId = searchParams.get("entityId") || undefined;
  const action = searchParams.get("action") || undefined;
  const actorId = searchParams.get("actorId") || undefined;
  const search = searchParams.get("search") || undefined;
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit")) || 50));
  const offset = Math.max(0, Number(searchParams.get("offset")) || 0);

  const result = await store.getAuditLogs({
    entityType,
    entityId,
    action,
    actorId,
    search,
    limit,
    offset,
  });

  return NextResponse.json({
    success: true,
    ...result,
  });
}
