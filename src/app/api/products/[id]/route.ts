import { NextResponse } from "next/server";
import store from "@/lib/db/store";
import { checkPermissionGuardAsync, checkAnyPermissionGuardAsync } from "@/lib/auth/serverAuth";
import { ROUTE_PERMISSIONS } from "@/lib/auth/routePermissions";
import { friendlyApiError } from "@/lib/db/friendlyError";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await checkAnyPermissionGuardAsync(req, [...ROUTE_PERMISSIONS.catalogRead]);
  if (denied) return denied;
  try {
    const { id } = await params;
    const product = await store.getProduct(id);
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    return NextResponse.json(product);
  } catch (err: any) {
    return NextResponse.json({ error: friendlyApiError(err) }, { status: 400 });
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await checkPermissionGuardAsync(req, "products:edit");
  if (denied) return denied;

  try {
    const { id } = await params;
    const body = await req.json();
    const product = await store.updateProduct(id, body);
    return NextResponse.json(product);
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

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await checkPermissionGuardAsync(req, "products:delete");
  if (denied) return denied;

  try {
    const { id } = await params;
    await store.deleteProduct(id);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: friendlyApiError(err) }, { status: 400 });
  }
}
