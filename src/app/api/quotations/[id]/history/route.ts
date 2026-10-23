import { NextResponse } from "next/server";
import store from "@/lib/db/store";
import { getActorFromRequestAsync } from "@/lib/auth/serverAuth";

export async function GET(
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

  const { id } = await params;
  const quote = await store.getQuotation(id);
  if (!quote) {
    return NextResponse.json({ error: "Quotation not found" }, { status: 404 });
  }

  // Super Admin has full access; Admin / Billing need quotations:view permission
  if (actor.role !== "SUPER_ADMIN" && !actor.hasPermission("quotations:view")) {
    return NextResponse.json(
      { error: "Forbidden: Permission required to view quotation history." },
      { status: 403 }
    );
  }

  let { logs } = await store.getAuditLogs({
    entityType: "QUOTATION",
    entityId: id,
    limit: 100,
  });

  if (logs.length === 0) {
    try {
      await store.recordAuditLog({
        entityType: "QUOTATION",
        entityId: quote.id,
        entityNumber: quote.quotationNumber,
        customerName: quote.customerName,
        action: "QUOTATION_CREATED",
        actionLabel: "Quotation Created",
        actor: { name: quote.createdBy || "Super Administrator", role: "SUPER_ADMIN" },
        details: {
          summary: `Quotation #${quote.quotationNumber} created for ${quote.customerName}`,
          grandTotal: quote.grandTotal,
          rentalDays: quote.rentalDays,
        },
        createdAt: quote.createdAt || new Date().toISOString(),
      });

      if (quote.status === "CONVERTED") {
        await store.recordAuditLog({
          entityType: "QUOTATION",
          entityId: quote.id,
          entityNumber: quote.quotationNumber,
          customerName: quote.customerName,
          action: "QUOTATION_CONVERTED",
          actionLabel: "Quotation Converted to Bill",
          actor: { name: "Super Administrator", role: "SUPER_ADMIN" },
          details: {
            summary: `Quotation #${quote.quotationNumber} converted to bill #${quote.convertedBillNumber || ""}`,
            convertedBillId: quote.convertedBillId,
            convertedBillNumber: quote.convertedBillNumber,
          },
          createdAt: quote.convertedAt || quote.updatedAt || quote.createdAt,
        });
      }

      const refreshed = await store.getAuditLogs({
        entityType: "QUOTATION",
        entityId: id,
        limit: 100,
      });
      logs = refreshed.logs;
    } catch (backfillErr) {
      console.error("[quotations/history] Failed to backfill baseline audit log:", backfillErr);
    }
  }

  return NextResponse.json({
    success: true,
    quotationNumber: quote.quotationNumber,
    customerName: quote.customerName,
    history: logs,
  });
}
