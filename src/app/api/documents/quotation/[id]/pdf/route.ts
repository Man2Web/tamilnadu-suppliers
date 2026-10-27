import { NextResponse } from "next/server";
import store from "@/lib/db/store";
import { generateQuotationPDF } from "@/lib/pdf/generator";
import { getActorFromRequestAsync, checkAnyPermissionGuardAsync } from "@/lib/auth/serverAuth";
import { ROUTE_PERMISSIONS } from "@/lib/auth/routePermissions";
import { friendlyApiError } from "@/lib/db/friendlyError";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await checkAnyPermissionGuardAsync(req, [...ROUTE_PERMISSIONS.quotationPdf]);
  if (denied) return denied;
  try {
    const { id } = await params;
    const quotation = await store.getQuotation(id);
    if (!quotation) {
      return NextResponse.json({ error: "Quotation not found" }, { status: 404 });
    }

    const doc = generateQuotationPDF(quotation);
    const pdfBuffer = Buffer.from(doc.output("arraybuffer"));

    const actor = await getActorFromRequestAsync(req);
    await store.recordAuditLog({
      entityType: "QUOTATION",
      entityId: quotation.id,
      entityNumber: quotation.quotationNumber,
      customerName: quotation.customerName,
      action: "QUOTATION_PDF_GENERATED",
      actionLabel: "Quotation PDF Generated",
      actor,
      details: {
        summary: `Generated PDF for quotation #${quotation.quotationNumber}`,
      },
    });

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="Quotation_${quotation.quotationNumber}.pdf"`,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: friendlyApiError(err) }, { status: 500 });
  }
}
