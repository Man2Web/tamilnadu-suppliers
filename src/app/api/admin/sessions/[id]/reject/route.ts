import { NextResponse } from "next/server";
import store from "@/lib/db/store";
import { getActorFromRequestAsync } from "@/lib/auth/serverAuth";
import { friendlyApiError } from "@/lib/db/friendlyError";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActorFromRequestAsync(req);
  if (!actor.isAuthenticated) {
    return NextResponse.json(
      { error: "Unauthorized: Authentication required." },
      { status: 401 }
    );
  }

  if (actor.role !== "SUPER_ADMIN") {
    return NextResponse.json(
      { error: "Forbidden: Only Super Admin can reject active sessions." },
      { status: 403 }
    );
  }

  try {
    const { id: sessionId } = await params;
    const session = await store.getSession(sessionId);

    if (!session) {
      return NextResponse.json(
        { error: "Session not found." },
        { status: 404 }
      );
    }

    if (session.status !== "ACTIVE") {
      return NextResponse.json(
        { error: `Session is already ${session.status}. Only ACTIVE sessions can be rejected.` },
        { status: 400 }
      );
    }

    // Safety guard: Super Admin cannot reject their own current active session
    if (session.id === actor.sessionId) {
      return NextResponse.json(
        { error: "Cannot reject your own active Super Admin session." },
        { status: 400 }
      );
    }

    const updatedSession = await store.rejectSession(sessionId, actor);

    return NextResponse.json({
      success: true,
      message: `Session for ${updatedSession.userName} (${updatedSession.role}) has been terminated.`,
      session: updatedSession,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: friendlyApiError(err, "Failed to reject session.") },
      { status: 400 }
    );
  }
}
