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
    return NextResponse.json({
      bill,
      incidents: bill.incidents || [],
      amendments: bill.amendments || [],
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await checkAnyPermissionGuardAsync(req, [...ROUTE_PERMISSIONS.returnsProcess]);
  if (denied) return denied;
  try {
    const actor = await getActorFromRequestAsync(req);
    const { id } = await params;
    const body = await req.json();
    const result = await store.recordBillReturn(id, body, actor);
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
