import { NextResponse } from "next/server";
import store from "@/lib/db/store";
import { generateBillPDF } from "@/lib/pdf/generator";
import { getActorFromRequestAsync, checkAnyPermissionGuardAsync } from "@/lib/auth/serverAuth";
import { ROUTE_PERMISSIONS } from "@/lib/auth/routePermissions";
import { friendlyApiError } from "@/lib/db/friendlyError";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await checkAnyPermissionGuardAsync(req, [...ROUTE_PERMISSIONS.billPdf]);
  if (denied) return denied;
  try {
    const { id } = await params;
    const bill = await store.getBill(id);
    if (!bill) {
      return NextResponse.json({ error: "Bill not found" }, { status: 404 });
    }

    const doc = generateBillPDF(bill);
    const pdfBuffer = Buffer.from(doc.output("arraybuffer"));

    const actor = await getActorFromRequestAsync(req);
    await store.recordAuditLog({
      entityType: "BILL",
      entityId: bill.id,
      entityNumber: bill.billNumber,
      customerName: bill.customerName,
      action: "BILL_PDF_GENERATED",
      actionLabel: "Bill PDF Generated",
      actor,
      details: {
        summary: `Generated PDF for bill #${bill.billNumber}`,
      },
    });

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="Bill_${bill.billNumber}.pdf"`,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: friendlyApiError(err) }, { status: 500 });
  }
}
