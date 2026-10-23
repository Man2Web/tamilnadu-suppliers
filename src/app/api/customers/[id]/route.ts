import { NextResponse } from "next/server";
import { checkAnyPermissionGuardAsync } from "@/lib/auth/serverAuth";
import { ROUTE_PERMISSIONS } from "@/lib/auth/routePermissions";
import store from "@/lib/db/store";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await checkAnyPermissionGuardAsync(req, [...ROUTE_PERMISSIONS.customerRead]);
  if (denied) return denied;
  try {
    const { id } = await params;
    const customer = await store.getCustomer(id);
    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    const allBills = await store.getBills();
    const bills = allBills.filter((b) => b.customerId === id);
    const totalBills = bills.length;
    const outstandingBalance = bills.reduce((sum, b) => {
      if (b.status === "CANCELLED") return sum;
      return sum + (b.balanceDue || 0);
    }, 0);

    return NextResponse.json({
      ...customer,
      totalBills,
      outstandingBalance: Math.max(0, Math.round(outstandingBalance * 100) / 100),
      customerType: customer.gstin ? "Commercial (GST)" : "Direct / Retail",
      status: customer.isActive ? "Active" : "Inactive",
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await checkAnyPermissionGuardAsync(req, [...ROUTE_PERMISSIONS.customerEdit]);
  if (denied) return denied;
  try {
    const { id } = await params;
    const body = await req.json();

    const updated = await store.updateCustomer(id, body);
    return NextResponse.json(updated);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
