import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { flushPendingOutboxEvents } from "@/modules/outbox/outbox-service";
import { evaluateDueBackgroundJobs } from "@/modules/notifications/notification-service";

export async function POST() {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [outbox, dueJobs] = await Promise.all([
    flushPendingOutboxEvents({ userId: user.id, limit: 25 }),
    evaluateDueBackgroundJobs({ userId: user.id, limit: 25 }),
  ]);

  return NextResponse.json({
    ok: true,
    outbox,
    dueJobs,
  });
}
