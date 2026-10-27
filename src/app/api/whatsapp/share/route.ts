import { NextResponse } from "next/server";
import { checkAnyPermissionGuardAsync } from "@/lib/auth/serverAuth";
import { ROUTE_PERMISSIONS } from "@/lib/auth/routePermissions";
import store from "@/lib/db/store";
import {
  buildBillWhatsAppMessage,
  buildQuotationWhatsAppMessage,
  generateWhatsAppHandoffUrl,
  createWhatsAppLogRecord,
} from "@/lib/whatsapp/share";
import { friendlyApiError } from "@/lib/db/friendlyError";

export async function POST(req: Request) {
  const denied = await checkAnyPermissionGuardAsync(req, [...ROUTE_PERMISSIONS.share]);
  if (denied) return denied;
  try {
    const body = await req.json();
    const { documentType, documentId, phone, appUrl } = body;
    if (typeof phone !== "string" || phone.replace(/\D/g, "").length < 7) {
      return NextResponse.json({ error: "A valid recipient phone number is required." }, { status: 400 });
    }

    let message = "";
    let docNumber = "";
    let recipientName = "";

    if (documentType === "BILL") {
      const bill = await store.getBill(documentId);
      if (!bill) return NextResponse.json({ error: "Bill not found" }, { status: 404 });
      message = buildBillWhatsAppMessage(bill, appUrl || "http://localhost:3000");
      docNumber = bill.billNumber;
      recipientName = bill.customerName;
    } else if (documentType === "QUOTATION") {
      const quotation = await store.getQuotation(documentId);
      if (!quotation) return NextResponse.json({ error: "Quotation not found" }, { status: 404 });
      message = buildQuotationWhatsAppMessage(quotation, appUrl || "http://localhost:3000");
      docNumber = quotation.quotationNumber;
      recipientName = quotation.customerName;
    } else {
      return NextResponse.json({ error: "Invalid document type" }, { status: 400 });
    }

    const handoffUrl = generateWhatsAppHandoffUrl(phone, message);

    const logRecord = createWhatsAppLogRecord(
      {
        recipientPhone: phone,
        recipientName,
        documentType,
        documentId,
        documentNumber: docNumber,
      },
      message
    );

    // Track status
    logRecord.status = "WINDOW_OPENED";

    return NextResponse.json({
      success: true,
      handoffUrl,
      message,
      log: logRecord,
    });
  } catch (err: any) {
    return NextResponse.json({ error: friendlyApiError(err) }, { status: 500 });
  }
}
