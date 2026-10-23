import { NextResponse } from "next/server";
import store from "@/lib/db/store";
import { getActorFromRequestAsync, checkAnyPermissionGuardAsync } from "@/lib/auth/serverAuth";
import { ROUTE_PERMISSIONS } from "@/lib/auth/routePermissions";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await checkAnyPermissionGuardAsync(req, [...ROUTE_PERMISSIONS.quotationConvert]);
  if (denied) return denied;
  try {
    const actor = await getActorFromRequestAsync(req);
    const { id } = await params;
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // Body is optional
    }
    const bill = await store.convertQuotationToBill(id, undefined, {
      advancePaid: body?.advancePaid !== undefined ? Number(body.advancePaid) : undefined,
      paymentMethod: body?.paymentMethod,
      actor,
    });
    return NextResponse.json({ success: true, bill });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
