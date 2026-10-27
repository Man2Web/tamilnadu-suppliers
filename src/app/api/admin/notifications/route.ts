import { NextResponse } from "next/server";
import store from "@/lib/db/store";
import { getActorFromRequestAsync } from "@/lib/auth/serverAuth";
import { friendlyApiError } from "@/lib/db/friendlyError";

export async function GET(req: Request) {
  const actor = await getActorFromRequestAsync(req);
  if (!actor.isAuthenticated) {
    return NextResponse.json(
      { error: "Unauthorized: Authentication required." },
      { status: 401 }
    );
  }

  if (actor.role !== "SUPER_ADMIN") {
    return NextResponse.json(
      { error: "Forbidden: Super Admin access required." },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(req.url);
  const unreadOnly = searchParams.get("unread") === "true";
  const limit = Number(searchParams.get("limit")) || 50;

  const result = await store.getNotifications({
    unreadOnly,
    limit,
  });

  return NextResponse.json({
    success: true,
    ...result,
  });
}

export async function POST(req: Request) {
  const actor = await getActorFromRequestAsync(req);
  if (!actor.isAuthenticated) {
    return NextResponse.json(
      { error: "Unauthorized: Authentication required." },
      { status: 401 }
    );
  }

  if (actor.role !== "SUPER_ADMIN") {
    return NextResponse.json(
      { error: "Forbidden: Super Admin access required." },
      { status: 403 }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const ids = Array.isArray(body.ids) ? body.ids : undefined;
    await store.markNotificationsRead(ids);

    const result = await store.getNotifications({ limit: 50 });
    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: friendlyApiError(err, "Failed to update notifications.") },
      { status: 400 }
    );
  }
}
