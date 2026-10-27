import { NextResponse } from "next/server";
import store from "@/lib/db/store";
import { getActorFromRequestAsync, checkAnyPermissionGuardAsync } from "@/lib/auth/serverAuth";
import { ROUTE_PERMISSIONS } from "@/lib/auth/routePermissions";
import { friendlyApiError } from "@/lib/db/friendlyError";

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
    const existingGps = await store.getGatePassesByBillId(id);
    if (existingGps && existingGps.length > 0) {
      const isElevated =
        actor.role === "ADMIN" ||
        actor.role === "SUPER_ADMIN" ||
        actor.role === "OWNER";
      const isExplicitTrue = body?.allowAdditionalDispatch === true;

      if (!isExplicitTrue || !isElevated) {
        const firstGpNum = existingGps[0].gatePassNumber || (existingGps[0] as any).gate_pass_number || existingGps[0].id;
        return NextResponse.json(
          {
            error: `Bill #${bill.billNumber} has already been dispatched under Gate Pass ${firstGpNum}. Duplicate dispatch rejected. Additional dispatches require ADMIN or OWNER authorization with explicit allowAdditionalDispatch flag.`,
          },
          { status: 400 }
        );
      }
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
      // Document notes are not goods: only product lines are dispatched
      items: body.items || (bill.branches || []).flatMap((b) =>
        b.items.filter((it) => (it.entryType || "product") !== "note").map((it) => ({
          productId: it.productId,
          itemName: it.itemName,
          sizeSpec: it.sizeSpec,
          quantityDispatched: it.quantity,
        }))
      ),
      actor,
      allowAdditionalDispatch: body?.allowAdditionalDispatch,
      allowStockShortfall: body?.allowStockShortfall === true,
      stockShortfallReason: typeof body?.stockShortfallReason === "string" ? body.stockShortfallReason : undefined,
    });

    const updatedBill = await store.getBill(id);
    return NextResponse.json({ success: true, gatePass, bill: updatedBill });
  } catch (err: any) {
    return NextResponse.json({ error: friendlyApiError(err) }, { status: 400 });
  }
}
