import { NextResponse } from "next/server";
import store from "@/lib/db/store";
import { checkPermissionGuardAsync, getActorFromRequestAsync } from "@/lib/auth/serverAuth";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // Permission guard: Account must have permission to record payments
  const denied = await checkPermissionGuardAsync(req, "payments:record");
  if (denied) return denied;

  try {
    const actor = await getActorFromRequestAsync(req);
    const { id } = await params;
    const bill = await store.getBill(id);
    if (!bill) {
      return NextResponse.json({ error: "Bill not found" }, { status: 404 });
    }

    const body = await req.json();
    if (!body.amount || Number(body.amount) <= 0) {
      return NextResponse.json({ error: "Valid payment amount is required" }, { status: 400 });
    }

    const payment = await store.recordPayment({
      ...body,
      billId: id,
      companyId: bill.companyId,
      customerId: bill.customerId,
      customerName: bill.customerName,
      actor,
    });

    const updatedBill = await store.getBill(id);
    return NextResponse.json({ success: true, payment, bill: updatedBill }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
