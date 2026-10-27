import { NextResponse } from "next/server";
import store from "@/lib/db/store";
import { getActorFromRequestAsync, checkPermissionGuardAsync, requireAuthenticatedAsync } from "@/lib/auth/serverAuth";
import { friendlyApiError } from "@/lib/db/friendlyError";

export async function GET(req: Request) {
  const denied = await requireAuthenticatedAsync(req);
  if (denied) return denied;
  const companies = await store.getCompanies();
  return NextResponse.json(companies);
}

export async function POST(req: Request) {
  const denied = await checkPermissionGuardAsync(req, "companies:manage");
  if (denied) return denied;

  try {
    const actor = await getActorFromRequestAsync(req);
    const body = await req.json();
    const newCompany = await store.createCompany(body, actor.role);
    return NextResponse.json(newCompany, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: friendlyApiError(err) }, { status: 400 });
  }
}

export async function PUT(req: Request) {
  const denied = await checkPermissionGuardAsync(req, "companies:manage");
  if (denied) return denied;

  try {
    const actor = await getActorFromRequestAsync(req);
    const body = await req.json();
    const { id, ...updates } = body;
    if (!id) return NextResponse.json({ error: "Company ID required" }, { status: 400 });
    const updated = await store.updateCompany(id, updates, actor.role);
    return NextResponse.json(updated);
  } catch (err: any) {
    return NextResponse.json({ error: friendlyApiError(err) }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const denied = await checkPermissionGuardAsync(req, "companies:manage");
  if (denied) return denied;

  try {
    const actor = await getActorFromRequestAsync(req);
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Company ID required" }, { status: 400 });
    const result = await store.deleteCompany(id, actor.role);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: friendlyApiError(err) }, { status: 400 });
  }
}
