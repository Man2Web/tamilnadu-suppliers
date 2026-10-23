import { NextResponse } from "next/server";
import store from "@/lib/db/store";
import { getActorFromRequestAsync, checkPermissionGuardAsync, checkAnyPermissionGuardAsync } from "@/lib/auth/serverAuth";
import { ROUTE_PERMISSIONS } from "@/lib/auth/routePermissions";

export async function GET(req: Request) {
  const denied = await checkAnyPermissionGuardAsync(req, [...ROUTE_PERMISSIONS.quotationRead]);
  if (denied) return denied;
  const actor = await getActorFromRequestAsync(req);
  if (!actor.isAuthenticated) {
    return NextResponse.json(
      { error: "Unauthorized: Authentication required.", code: actor.isSessionRejected ? "SESSION_REJECTED" : "UNAUTHENTICATED" },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const companyId = searchParams.get("companyId");

  let quotations = await store.getQuotations();

  if (status) {
    quotations = quotations.filter((q) => q.status === status);
  }
  if (companyId) {
    quotations = quotations.filter((q) => q.companyId === companyId);
  }

  return NextResponse.json(quotations);
}

export async function POST(req: Request) {
  const denied = await checkPermissionGuardAsync(req, "quotations:create");
  if (denied) return denied;
  try {
    const actor = await getActorFromRequestAsync(req);
    if (!actor.isAuthenticated) {
      return NextResponse.json(
        { error: "Unauthorized: Authentication required.", code: actor.isSessionRejected ? "SESSION_REJECTED" : "UNAUTHENTICATED" },
        { status: 401 }
      );
    }
    const body = await req.json();
    if (!body.companyId) {
      return NextResponse.json({ error: "Issuing company is required" }, { status: 400 });
    }
    if (!body.customerName || !body.customerPhone) {
      return NextResponse.json({ error: "Customer details are required" }, { status: 400 });
    }
    const quotation = await store.createQuotation({ ...body, actor });
    return NextResponse.json(quotation, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
