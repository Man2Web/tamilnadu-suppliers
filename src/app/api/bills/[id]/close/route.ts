import { NextResponse } from "next/server";
import store from "@/lib/db/store";
import { checkPermissionGuardAsync, getActorFromRequestAsync } from "@/lib/auth/serverAuth";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await checkPermissionGuardAsync(req, "bills:close");
  if (denied) return denied;

  try {
    const actor = await getActorFromRequestAsync(req);
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const closedBill = await store.closeBill(id, { ...body, actor }, actor);
    return NextResponse.json({ success: true, bill: closedBill });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
