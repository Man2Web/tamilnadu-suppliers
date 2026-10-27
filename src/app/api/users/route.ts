import { NextResponse } from "next/server";
import store from "@/lib/db/store";
import { getActorFromRequestAsync } from "@/lib/auth/serverAuth";
import { friendlyApiError } from "@/lib/db/friendlyError";

export async function GET(req: Request) {
  // Can view user list if Super Admin or has users:manage
  const actor = await getActorFromRequestAsync(req);
  if (!actor.isAuthenticated) {
    return NextResponse.json(
      { error: "Unauthorized: Authentication required." },
      { status: 401 }
    );
  }
  if (!actor.hasPermission("users:manage") && actor.role !== "SUPER_ADMIN") {
    return NextResponse.json(
      { error: "Forbidden: Super Admin access or 'users:manage' permission required." },
      { status: 403 }
    );
  }

  let users = await store.getUsers();
  // Security guard: If the requesting actor is not Super Admin, never expose the Super Admin root account
  if (actor.role !== "SUPER_ADMIN") {
    users = users.filter((u) => u.role !== "SUPER_ADMIN");
  }

  return NextResponse.json(users);
}

export async function POST(req: Request) {
  const actor = await getActorFromRequestAsync(req);
  if (!actor.isAuthenticated) {
    return NextResponse.json(
      { error: "Unauthorized: Authentication required." },
      { status: 401 }
    );
  }
  if (actor.role !== "SUPER_ADMIN" && !actor.hasPermission("users:manage")) {
    return NextResponse.json(
      { error: "Forbidden: Only Super Admin can create user accounts and assign permissions." },
      { status: 403 }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const newUser = await store.createUser(body, actor.role);
    return NextResponse.json(newUser, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: friendlyApiError(err) }, { status: 400 });
  }
}
