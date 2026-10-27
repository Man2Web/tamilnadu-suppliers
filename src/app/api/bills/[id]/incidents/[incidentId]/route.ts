import { NextResponse } from "next/server";
import store from "@/lib/db/store";
import { getActorFromRequestAsync, checkAnyPermissionGuardAsync } from "@/lib/auth/serverAuth";
import { ROUTE_PERMISSIONS } from "@/lib/auth/routePermissions";
import { friendlyApiError } from "@/lib/db/friendlyError";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; incidentId: string }> }
) {
  const denied = await checkAnyPermissionGuardAsync(req, [...ROUTE_PERMISSIONS.returnsProcess]);
  if (denied) return denied;
  try {
    const actor = await getActorFromRequestAsync(req);
    const { id, incidentId } = await params;
    const body = await req.json();
    const updatedBill = await store.resolveDamageMissingIncident(id, incidentId, { ...body, actor }, actor);
    return NextResponse.json({ success: true, bill: updatedBill });
  } catch (err: any) {
    return NextResponse.json({ error: friendlyApiError(err) }, { status: 400 });
  }
}
