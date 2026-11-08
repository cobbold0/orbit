import { notFound, redirect } from "next/navigation";
import { NotificationDeliveryStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { getShellBadgeCounts } from "@/lib/shell-data";
import { getOrCreateUserPreferences } from "@/modules/notifications/notification-service";
import type { CheckInMetadataPayload } from "@/modules/notifications/notification-service";
import { formatClock, formatShortDate } from "@/lib/time/format";
import { OrbitShell } from "@/components/shell/orbit-shell";
import { CheckInResponseClient } from "@/components/notifications/check-in-response-client";

export const dynamic = "force-dynamic";

export default async function CheckInPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const { id } = await params;

  const [notification, pref, lifeAreas, projects, badges] = await Promise.all([
    prisma.notification.findFirst({
      where: { id, userId: user.id },
      include: {
        task: { include: { lifeArea: true } },
      },
    }),
    getOrCreateUserPreferences(user.id),
    prisma.lifeArea.findMany({
      where: { userId: user.id, isArchived: false },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.project.findMany({
      where: { userId: user.id, status: "ACTIVE" },
      orderBy: { sortOrder: "asc" },
    }),
    getShellBadgeCounts(user.id),
  ]);

  if (!notification) {
    notFound();
  }

  // Mark as READ if opened while still DELIVERED? Keep DELIVERED until responded or dismissed so badge reflects unanswered check-ins, just record readAt!
  if (!notification.readAt && notification.status === NotificationDeliveryStatus.DELIVERED) {
    await prisma.notification.update({
      where: { id: notification.id },
      data: { readAt: new Date() },
    });
  }

  const fallbackMeta: CheckInMetadataPayload = notification.task
    ? {
        promptKind: "TASK",
        taskTitle: notification.task.title,
        lifeAreaName: notification.task.lifeArea.name,
        lifeAreaColor: notification.task.lifeArea.colorToken,
        options: [
          { value: "COMPLETED", label: "Completed", tone: "primary" },
          { value: "STILL_WORKING_30M", label: "+30 min", tone: "secondary" },
          { value: "MAKE_FLEXIBLE", label: "Make flexible", tone: "ghost" },
        ],
      }
    : {
        promptKind: "ACTIVITY",
        options: [
          { value: "LOG_WORK", label: "Log work", tone: "primary" },
          { value: "DISMISS", label: "Skip for now", tone: "ghost" },
        ],
      };

  const parsedMeta =
    notification.metadata && typeof notification.metadata === "object"
      ? (notification.metadata as unknown as CheckInMetadataPayload)
      : fallbackMeta;

  const ts = notification.deliveredAt ?? notification.createdAt;
  const deliveredAtLabel = `${formatShortDate(ts, pref.ianaTimeZone)}, ${formatClock(
    ts,
    pref.ianaTimeZone
  )}`;

  return (
    <OrbitShell
      lifeAreas={lifeAreas}
      projects={projects}
      unreviewedInboxCount={badges.unreviewedInboxCount}
      unreadCheckInCount={badges.unreadCheckInCount}
    >
      <CheckInResponseClient
        checkIn={{
          id: notification.id,
          category: notification.category,
          title: notification.title,
          body: notification.body,
          status: notification.status,
          responseValue: notification.responseValue,
          responseNote: notification.responseNote,
          deliveredAtLabel,
          metadata: parsedMeta,
        }}
        lifeAreas={lifeAreas.map((a) => ({
          id: a.id,
          name: a.name,
          colorToken: a.colorToken,
        }))}
      />
    </OrbitShell>
  );
}
