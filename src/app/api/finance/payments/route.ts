import { NextResponse } from "next/server";
import store from "@/lib/db/store";
import { checkPermissionGuardAsync } from "@/lib/auth/serverAuth";

export async function GET(req: Request) {
  const denied = await checkPermissionGuardAsync(req, "payments:record");
  // Also allowed if has bills:view
  if (denied && (await checkPermissionGuardAsync(req, "bills:view"))) {
    return denied;
  }
  const payments = await store.getPayments();
  return NextResponse.json(payments);
}

export async function POST(req: Request) {
  // Permission guard: Account must have permission to record payments
  const denied = await checkPermissionGuardAsync(req, "payments:record");
  if (denied) return denied;

  try {
    const body = await req.json();
    if (!body.amount || !body.customerName) {
      return NextResponse.json({ error: "Customer and amount required" }, { status: 400 });
    }
    const companies = await store.getCompanies();
    const companyId = body.companyId || (companies[0] ? companies[0].id : "");
    const payment = await store.recordPayment({
      ...body,
      companyId,
      customerId: body.customerId || "cust-1",
    });
    return NextResponse.json(payment, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
