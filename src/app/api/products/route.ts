import { NextResponse } from "next/server";
import store from "@/lib/db/store";
import { checkPermissionGuardAsync, checkAnyPermissionGuardAsync } from "@/lib/auth/serverAuth";
import { ROUTE_PERMISSIONS } from "@/lib/auth/routePermissions";

export async function GET(req: Request) {
  const denied = await checkAnyPermissionGuardAsync(req, [...ROUTE_PERMISSIONS.catalogRead]);
  if (denied) return denied;
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q")?.toLowerCase();
  const category = searchParams.get("category");

  let products = await store.getProducts();

  if (query) {
    products = products.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        (p.alias && p.alias.toLowerCase().includes(query)) ||
        (p.sizeSpec && p.sizeSpec.toLowerCase().includes(query))
    );
  }

  if (category) {
    products = products.filter((p) => p.categoryName === category);
  }

  return NextResponse.json(products);
}

export async function POST(req: Request) {
  const denied = await checkPermissionGuardAsync(req, "products:create");
  if (denied) return denied;

  try {
    const body = await req.json();
    if (!body.name || body.name.trim().length === 0) {
      return NextResponse.json({ error: "Product name is required" }, { status: 400 });
    }
    const product = await store.createProduct(body);
    return NextResponse.json(product, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

export async function PUT(req: Request) {
  const denied = await checkPermissionGuardAsync(req, "products:edit");
  if (denied) return denied;

  try {
    const body = await req.json();
    const { id, ...updates } = body;
    if (!id) return NextResponse.json({ error: "Product ID is required" }, { status: 400 });
    const product = await store.updateProduct(id, updates);
    return NextResponse.json(product);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
