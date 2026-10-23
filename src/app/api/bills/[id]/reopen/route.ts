import { NextResponse } from "next/server";
import store from "@/lib/db/store";
import { getActorFromRequestAsync } from "@/lib/auth/serverAuth";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActorFromRequestAsync(req);
  if (!actor.isAuthenticated) {
    return NextResponse.json(
      { error: "Unauthorized: Authentication required." },
      { status: 401 }
    );
  }

  if (actor.role !== "SUPER_ADMIN" && actor.role !== "ADMIN") {
    return NextResponse.json(
      { error: "Forbidden: Super Admin or Admin authorization required to reopen a closed bill." },
      { status: 403 }
    );
  }

  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const reason = body.reason || "Authorized adjustment";
    const bill = await store.reopenBill(id, reason, actor);


    return NextResponse.json({
      success: true,
      message: `Bill #${bill.billNumber} reopened successfully.`,
      bill,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to reopen bill." },
      { status: 400 }
    );
  }
}
