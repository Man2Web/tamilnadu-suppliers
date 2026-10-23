import { NextResponse } from "next/server";
import store from "@/lib/db/store";
import { getActorFromRequestAsync, checkAnyPermissionGuardAsync } from "@/lib/auth/serverAuth";
import { ROUTE_PERMISSIONS } from "@/lib/auth/routePermissions";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await checkAnyPermissionGuardAsync(req, [...ROUTE_PERMISSIONS.billRead]);
  if (denied) return denied;
  try {
    const { id } = await params;
    const bill = await store.getBill(id);
    if (!bill) return NextResponse.json({ error: "Bill not found" }, { status: 404 });
    return NextResponse.json(bill);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await checkAnyPermissionGuardAsync(req, [...ROUTE_PERMISSIONS.billWorkspaceSave]);
  if (denied) return denied;
  try {
    const actor = await getActorFromRequestAsync(req);
    const { id } = await params;
    const body = await req.json();
    const updated = await store.saveBillWorkspaceChanges(id, body, actor);
    return NextResponse.json({ success: true, bill: updated });
  } catch (err: any) {
    console.error(`[API /api/bills/id PUT] Error saving bill changes:`, err);
    return NextResponse.json({ error: err.message || "Failed to update bill" }, { status: 400 });
  }
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  return PUT(req, context);
}
