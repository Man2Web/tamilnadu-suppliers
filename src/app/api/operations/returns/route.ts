import { NextResponse } from "next/server";
import { checkAnyPermissionGuardAsync } from "@/lib/auth/serverAuth";
import { ROUTE_PERMISSIONS } from "@/lib/auth/routePermissions";
import store from "@/lib/db/store";
import { friendlyApiError } from "@/lib/db/friendlyError";

export async function GET(req: Request) {
  const denied = await checkAnyPermissionGuardAsync(req, [...ROUTE_PERMISSIONS.operationsRead]);
  if (denied) return denied;
  const returns = await store.getReturns();
  return NextResponse.json(returns);
}

export async function POST(req: Request) {
  const denied = await checkAnyPermissionGuardAsync(req, [...ROUTE_PERMISSIONS.returnsProcess]);
  if (denied) return denied;
  try {
    const body = await req.json();
    const ret = await store.recordReturn(body);
    return NextResponse.json(ret, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: friendlyApiError(err) }, { status: 400 });
  }
}
