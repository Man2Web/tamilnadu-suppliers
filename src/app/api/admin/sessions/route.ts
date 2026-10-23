import { NextResponse } from "next/server";
import store from "@/lib/db/store";
import { getActorFromRequestAsync } from "@/lib/auth/serverAuth";

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
      { error: "Forbidden: Super Admin access required to view login activity and sessions." },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") as any;
  const userId = searchParams.get("userId") || undefined;
  const search = searchParams.get("search") || undefined;

  const sessions = await store.getSessions({
    status: status || undefined,
    userId,
    search,
  });


  return NextResponse.json({
    success: true,
    sessions,
  });
}
