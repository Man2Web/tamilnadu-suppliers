import { NextResponse } from "next/server";
import store from "@/lib/db/store";
import { checkPermissionGuardAsync, getActorFromRequestAsync } from "@/lib/auth/serverAuth";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await checkPermissionGuardAsync(req, "bills:amend");
  if (denied) return denied;

  try {
    const actor = await getActorFromRequestAsync(req);
    const { id } = await params;
    const body = await req.json();
    const updatedBill = await store.amendBill(id, body, actor);
    return NextResponse.json({ success: true, bill: updatedBill });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
