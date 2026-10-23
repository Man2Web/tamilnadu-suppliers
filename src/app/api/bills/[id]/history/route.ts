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
  const bill = await store.getBill(id);
  if (!bill) {
    return NextResponse.json({ error: "Bill not found" }, { status: 404 });
  }

  // Super Admin has full access; Admin / Billing need bills:view permission
  if (actor.role !== "SUPER_ADMIN" && !actor.hasPermission("bills:view")) {
    return NextResponse.json(
      { error: "Forbidden: Permission required to view bill history." },
      { status: 403 }
    );
  }

  let { logs } = await store.getAuditLogs({
    entityType: "BILL",
    entityId: id,
    limit: 100,
  });

  let sourceQuotationNumber: string | null = null;
  let sourceQuotationHistory: any[] = [];
  if (bill.sourceQuotationId) {
    const srcQuote = await store.getQuotation(bill.sourceQuotationId);
    if (srcQuote) {
      sourceQuotationNumber = srcQuote.quotationNumber;
      const { logs: qLogs } = await store.getAuditLogs({
        entityType: "QUOTATION",
        entityId: bill.sourceQuotationId,
        limit: 50,
      });
      sourceQuotationHistory = qLogs;
    }
  }

  // Self-heal: If history is empty, synthesize baseline audit events from document metadata and payments
  if (logs.length === 0) {
    try {
      // 1. Creation event
      if (bill.sourceQuotationId) {
        await store.recordAuditLog({
          entityType: "BILL",
          entityId: bill.id,
          entityNumber: bill.billNumber,
          customerName: bill.customerName,
          action: "BILL_CREATED_FROM_QUOTE",
          actionLabel: "Bill Created from Quotation",
          actor: { name: bill.createdBy || "Super Administrator", role: "SUPER_ADMIN" },
          details: {
            summary: `Bill #${bill.billNumber} created from Quotation #${sourceQuotationNumber || ""}`,
            sourceQuotationId: bill.sourceQuotationId,
            sourceQuotationNumber,
            grandTotal: bill.grandTotal,
          },
          createdAt: bill.createdAt || new Date().toISOString(),
        });
      } else {
        await store.recordAuditLog({
          entityType: "BILL",
          entityId: bill.id,
          entityNumber: bill.billNumber,
          customerName: bill.customerName,
          action: "BILL_CREATED",
          actionLabel: "Direct Bill Created",
          actor: { name: bill.createdBy || "Super Administrator", role: "SUPER_ADMIN" },
          details: {
            summary: `Direct rental bill #${bill.billNumber} created for ${bill.customerName}`,
            grandTotal: bill.grandTotal,
            rentalDays: bill.rentalDays,
          },
          createdAt: bill.createdAt || new Date().toISOString(),
        });
      }

      // 2. Existing payments
      const payments = await store.getPayments(bill.id);
      for (const p of payments) {
        await store.recordAuditLog({
          entityType: "BILL",
          entityId: bill.id,
          entityNumber: bill.billNumber,
          customerName: bill.customerName,
          action: "PAYMENT_RECORDED",
          actionLabel: `Payment Recorded (${p.paymentType})`,
          actor: { name: "Billing Officer", role: "BILLING" },
          details: {
            summary: `Payment of ₹${p.amount.toFixed(2)} recorded via ${p.paymentMethod}`,
            paymentNumber: p.paymentNumber,
            paymentType: p.paymentType,
            paymentMethod: p.paymentMethod,
            amount: p.amount,
          },
          createdAt: p.createdAt || bill.createdAt,
        });
      }

      // 3. Status if closed
      if (bill.status === "CLOSED") {
        await store.recordAuditLog({
          entityType: "BILL",
          entityId: bill.id,
          entityNumber: bill.billNumber,
          customerName: bill.customerName,
          action: "BILL_CLOSED",
          actionLabel: "Rental Bill Closed",
          actor: { name: "Super Administrator", role: "SUPER_ADMIN" },
          details: {
            summary: `Rental bill #${bill.billNumber} closed`,
            closureNotes: bill.notes || "Final settlement & closure",
          },
          createdAt: bill.updatedAt || bill.createdAt,
        });
      }

      // Re-fetch after synthesis
      const refreshed = await store.getAuditLogs({
        entityType: "BILL",
        entityId: id,
        limit: 100,
      });
      logs = refreshed.logs;
    } catch (backfillErr) {
      console.error("[bills/history] Failed to backfill baseline audit log:", backfillErr);
    }
  }

  return NextResponse.json({
    success: true,
    billNumber: bill.billNumber,
    customerName: bill.customerName,
    sourceQuotationId: bill.sourceQuotationId || null,
    sourceQuotationNumber,
    sourceQuotationHistory,
    history: logs,
  });
}
