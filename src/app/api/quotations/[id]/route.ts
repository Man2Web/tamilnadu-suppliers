import { NextResponse } from "next/server";
import store from "@/lib/db/store";
import { getActorFromRequestAsync, checkAnyPermissionGuardAsync } from "@/lib/auth/serverAuth";
import { ROUTE_PERMISSIONS } from "@/lib/auth/routePermissions";
import { friendlyApiError } from "@/lib/db/friendlyError";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await checkAnyPermissionGuardAsync(req, [...ROUTE_PERMISSIONS.quotationRead]);
  if (denied) return denied;
  try {
    const { id } = await params;
    const quote = await store.getQuotation(id);
    if (!quote) return NextResponse.json({ error: "Quotation not found" }, { status: 404 });
    return NextResponse.json(quote);
  } catch (err: any) {
    return NextResponse.json({ error: friendlyApiError(err) }, { status: 400 });
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await checkAnyPermissionGuardAsync(req, [...ROUTE_PERMISSIONS.quotationEdit]);
  if (denied) return denied;
  try {
    const actor = await getActorFromRequestAsync(req);
    const { id } = await params;
    const quote = await store.getQuotation(id);
    if (!quote) return NextResponse.json({ error: "Quotation not found" }, { status: 404 });

    const allBills = await store.getBills();
    const isConverted =
      quote.status === "CONVERTED" ||
      Boolean(quote.convertedBillId) ||
      allBills.some((b) => b.sourceQuotationId === quote.id);

    if (isConverted) {
      return NextResponse.json(
        { error: "Quotation cannot be edited because it has already been converted to a bill." },
        { status: 403 }
      );
    }

    const body = await req.json();

    if (body.action === "revise") {
      const revised = await store.reviseQuotation(id, body, actor);
      return NextResponse.json({ success: true, quotation: revised });
    }

    if (body.status && Object.keys(body).length === 1) {
      const updated = await store.updateQuotationStatus(id, body.status, actor);
      return NextResponse.json({ success: true, quotation: updated });
    }

    const updated = await store.updateQuotation(id, body, actor);
    return NextResponse.json({ success: true, quotation: updated });
  } catch (err: any) {
    return NextResponse.json({ error: friendlyApiError(err) }, { status: 400 });
  }
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  return PUT(req, context);
}
