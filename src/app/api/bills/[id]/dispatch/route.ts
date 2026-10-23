import { NextResponse } from "next/server";
import store from "@/lib/db/store";
import { getActorFromRequestAsync, checkAnyPermissionGuardAsync } from "@/lib/auth/serverAuth";
import { ROUTE_PERMISSIONS } from "@/lib/auth/routePermissions";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await checkAnyPermissionGuardAsync(req, [...ROUTE_PERMISSIONS.dispatch]);
  if (denied) return denied;
  try {
    const actor = await getActorFromRequestAsync(req);
    const { id } = await params;
    const bill = await store.getBill(id);
    if (!bill) return NextResponse.json({ error: "Bill not found" }, { status: 404 });

    const body = await req.json();

    // Duplicate dispatch guard
    const { data: existingGps } = await (store as any).supabase
      .from("gate_passes")
      .select("id, gate_pass_number")
      .eq("bill_id", id);
    if (existingGps && existingGps.length > 0 && !body.allowAdditionalDispatch) {
      return NextResponse.json(
        { error: `Bill #${bill.billNumber} has already been dispatched under Gate Pass ${existingGps[0].gate_pass_number}. Duplicate dispatch rejected.` },
        { status: 400 }
      );
    }
    const gatePass = await store.createGatePass({
      companyId: bill.companyId,
      customerId: bill.customerId,
      customerName: bill.customerName,
      destinationBranch: body.destinationBranch || bill.branches?.[0]?.branchName || "Main Branch",
      destinationAddress: body.destinationAddress || bill.customerAddress,
      billId: bill.id,
      expectedReturnDate: bill.expectedReturnDate,
      vehicleNumber: body.vehicleNumber || null,
      driverName: body.driverName || null,
      driverPhone: body.driverPhone || null,
      notes: body.notes || null,
      items: body.items || (bill.branches || []).flatMap((b) =>
        b.items.map((it) => ({
          productId: it.productId,
          itemName: it.itemName,
          sizeSpec: it.sizeSpec,
          quantityDispatched: it.quantity,
        }))
      ),
      actor,
    });

    const updatedBill = await store.getBill(id);
    return NextResponse.json({ success: true, gatePass, bill: updatedBill });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
