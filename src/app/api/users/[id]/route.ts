import { NextResponse } from "next/server";
import store from "@/lib/db/store";
import { getActorFromRequestAsync } from "@/lib/auth/serverAuth";
import { friendlyApiError } from "@/lib/db/friendlyError";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const actor = await getActorFromRequestAsync(req);
  if (!actor.isAuthenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (actor.role !== "SUPER_ADMIN" && !actor.hasPermission("users:manage")) {
    return NextResponse.json(
      { error: "Forbidden: Super Admin access required" },
      { status: 403 }
    );
  }

  const user = await store.getUser(id);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Security guard: Non-super admins cannot view the Super Admin profile
  if (actor.role !== "SUPER_ADMIN" && user.role === "SUPER_ADMIN") {
    return NextResponse.json(
      { error: "Forbidden: Super Administrator profile is protected." },
      { status: 403 }
    );
  }

  return NextResponse.json(user);
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const actor = await getActorFromRequestAsync(req);
  if (!actor.isAuthenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (actor.role !== "SUPER_ADMIN" && !actor.hasPermission("users:manage") && actor.userId !== id) {
    return NextResponse.json(
      { error: "Forbidden: Only Super Admin can edit accounts and change permissions" },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    if (actor.userId === id && actor.role !== "SUPER_ADMIN") {
      delete body.role;
      delete body.permissions;
      delete body.status;
    }
    const updated = await store.updateUser(id, body, actor.role);
    return NextResponse.json(updated);
  } catch (err: any) {
    return NextResponse.json({ error: friendlyApiError(err) }, { status: 400 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const actor = await getActorFromRequestAsync(req);
  if (!actor.isAuthenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (actor.role !== "SUPER_ADMIN") {
    return NextResponse.json(
      { error: "Forbidden: Only Super Admin can delete user accounts" },
      { status: 403 }
    );
  }

  try {
    const result = await store.deleteUser(id, actor.role);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: friendlyApiError(err) }, { status: 400 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const actor = await getActorFromRequestAsync(req);
  if (!actor.isAuthenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (actor.role !== "SUPER_ADMIN" && !actor.hasPermission("users:manage")) {
    return NextResponse.json(
      { error: "Forbidden: Only Super Admin can modify account status or reset passwords" },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    if (body.action === "toggle-status") {
      const updated = await store.toggleUserStatus(id, actor.role);
      return NextResponse.json(updated);
    }
    if (body.action === "reset-password") {
      if (!body.password) {
        return NextResponse.json({ error: "New password is required" }, { status: 400 });
      }
      const result = await store.resetUserPassword(id, body.password, actor.role);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: friendlyApiError(err) }, { status: 400 });
  }
}
