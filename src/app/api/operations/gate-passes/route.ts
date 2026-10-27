import { NextResponse } from "next/server";
import { checkAnyPermissionGuardAsync, getActorFromRequestAsync } from "@/lib/auth/serverAuth";
import { ROUTE_PERMISSIONS } from "@/lib/auth/routePermissions";
import store from "@/lib/db/store";
import { friendlyApiError } from "@/lib/db/friendlyError";

export async function GET(req: Request) {
  const denied = await checkAnyPermissionGuardAsync(req, [...ROUTE_PERMISSIONS.operationsRead]);
  if (denied) return denied;
  const gatePasses = await store.getGatePasses();
  return NextResponse.json(gatePasses);
}

export async function POST(req: Request) {
  const denied = await checkAnyPermissionGuardAsync(req, [...ROUTE_PERMISSIONS.dispatch]);
  if (denied) return denied;
  try {
    const actor = await getActorFromRequestAsync(req);
    const body = await req.json();
    const gp = await store.createGatePass({ ...body, actor });
    return NextResponse.json(gp, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: friendlyApiError(err) }, { status: 400 });
  }
}
