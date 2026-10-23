import { NextResponse } from "next/server";
import { checkAnyPermissionGuardAsync } from "@/lib/auth/serverAuth";
import { ROUTE_PERMISSIONS } from "@/lib/auth/routePermissions";
import store from "@/lib/db/store";

export async function GET(req: Request) {
  const denied = await checkAnyPermissionGuardAsync(req, [...ROUTE_PERMISSIONS.customerRead]);
  if (denied) return denied;
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.toLowerCase();

  let customers = await store.getCustomers();
  const bills = await store.getBills();


  if (q) {
    customers = customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.mobile.includes(q) ||
        (c.email && c.email.toLowerCase().includes(q)) ||
        (c.gstin && c.gstin.toLowerCase().includes(q)) ||
        (c.branches && c.branches.some((b) => b.branchName.toLowerCase().includes(q)))
    );
  }

  // Calculate genuine totals from actual transaction records (no fabricated values)
  const enrichedCustomers = customers.map((c) => {
    const customerBills = bills.filter((b) => b.customerId === c.id);
    const totalBills = customerBills.length;
    const outstandingBalance = customerBills.reduce((sum, b) => {
      // Exclude CANCELLED bills from balance calculation
      if (b.status === "CANCELLED") return sum;
      return sum + (b.balanceDue || 0);
    }, 0);

    return {
      ...c,
      totalBills,
      outstandingBalance: Math.max(0, Math.round(outstandingBalance * 100) / 100),
      customerType: c.gstin ? "Commercial (GST)" : "Direct / Retail",
      status: c.isActive ? "Active" : "Inactive",
    };
  });

  return NextResponse.json(enrichedCustomers);
}

export async function POST(req: Request) {
  const denied = await checkAnyPermissionGuardAsync(req, [...ROUTE_PERMISSIONS.customerCreate]);
  if (denied) return denied;
  try {
    const body = await req.json();
    if (!body.name || !body.mobile) {
      return NextResponse.json({ error: "Customer name and mobile number are required" }, { status: 400 });
    }
    const customer = await store.createCustomer(body);
    return NextResponse.json(customer, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
