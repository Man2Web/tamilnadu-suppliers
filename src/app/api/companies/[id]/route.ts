import { NextResponse } from "next/server";
import { getActorFromRequestAsync, requireAuthenticatedAsync, requireSuperAdminAsync } from "@/lib/auth/serverAuth";
import store from "@/lib/db/store";
import { friendlyApiError } from "@/lib/db/friendlyError";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAuthenticatedAsync(req);
  if (denied) return denied;
  try {
    const { id } = await params;
    const company = await store.getCompany(id);
    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }
    return NextResponse.json(company);
  } catch (err: any) {
    return NextResponse.json({ error: friendlyApiError(err) }, { status: 400 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireSuperAdminAsync(req);
  if (denied) return denied;
  try {
    const role = (await getActorFromRequestAsync(req)).role;
    if (role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Unauthorized: Super Admin access required to delete companies." },
        { status: 403 }
      );
    }
    const { id } = await params;
    const result = await store.deleteCompany(id, role);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: friendlyApiError(err) }, { status: 400 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireSuperAdminAsync(req);
  if (denied) return denied;
  try {
    const role = (await getActorFromRequestAsync(req)).role;
    if (role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Unauthorized: Super Admin access required to update company status." },
        { status: 403 }
      );
    }
    const { id } = await params;
    const body = await req.json();
    if (body.isActive === false) {
      const comp = await store.deactivateCompany(id, role);
      return NextResponse.json(comp);
    } else if (body.isActive === true) {
      const comp = await store.activateCompany(id, role);
      return NextResponse.json(comp);
    }
    return NextResponse.json({ error: "Specify isActive status" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: friendlyApiError(err) }, { status: 400 });
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireSuperAdminAsync(req);
  if (denied) return denied;
  try {
    const role = (await getActorFromRequestAsync(req)).role;
    const { id } = await params;
    const body = await req.json();
    const updated = await store.updateCompany(id, body, role as any);
    return NextResponse.json(updated);
  } catch (err: any) {
    return NextResponse.json({ error: friendlyApiError(err) }, { status: 400 });
  }
}

