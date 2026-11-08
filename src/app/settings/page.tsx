import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getUnreviewedInboxActionCount } from "@/lib/shell-data";
import { getNotificationsAndSettingsData } from "@/modules/notifications/notification-service";
import { formatClock, formatShortDate } from "@/lib/time/format";
import { OrbitShell } from "@/components/shell/orbit-shell";
import { SettingsClient } from "@/components/settings/settings-client";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const params = await searchParams;

  const [data, unreviewedInboxCount] = await Promise.all([
    getNotificationsAndSettingsData(user.id),
    getUnreviewedInboxActionCount(user.id),
  ]);

  const tz = data.preferences.ianaTimeZone;
  const unreadCheckInCount = data.notifications.filter(
    (n) => n.status === "DELIVERED"
  ).length;

  const initialTab: "checkins" | "preferences" | "account" =
    params.tab === "account"
      ? "account"
      : params.tab === "preferences"
        ? "preferences"
        : params.tab === "checkins" || unreadCheckInCount > 0
          ? "checkins"
          : "preferences";

  const notifications = data.notifications.map((n) => {
    const ts = n.deliveredAt ?? n.createdAt;
    return {
      id: n.id,
      title: n.title,
      body: n.body,
      status: n.status,
      whenLabel: `${formatShortDate(ts, tz)}, ${formatClock(ts, tz)}`,
      actionUrl: n.actionUrl,
      lifeArea: n.task?.lifeArea
        ? {
            name: n.task.lifeArea.name,
            colorToken: n.task.lifeArea.colorToken,
          }
        : null,
    };
  });

  const pushDevices = data.pushSubscriptions.map((sub) => {
    let endpointHost = "Push service";
    try {
      endpointHost = new URL(sub.endpoint).hostname;
    } catch {
      // keep fallback
    }
    return {
      id: sub.id,
      deviceName: sub.deviceName ?? "Browser",
      endpointHost,
      addedLabel: formatShortDate(sub.createdAt, tz),
    };
  });

  return (
    <OrbitShell
      lifeAreas={data.lifeAreas}
      projects={data.projects}
      unreviewedInboxCount={unreviewedInboxCount}
      unreadCheckInCount={unreadCheckInCount}
      user={{
        name: user.name,
        email: user.email,
      }}
    >
      <SettingsClient
        initialTab={initialTab}
        user={{
          name: user.name,
          email: user.email,
        }}
        preferences={{
          ianaTimeZone: data.preferences.ianaTimeZone,
          morningBriefingEnabled: data.preferences.morningBriefingEnabled,
          morningBriefingTime: data.preferences.morningBriefingTime,
          declaredWakeTime: data.preferences.declaredWakeTime,
          declaredSleepTime: data.preferences.declaredSleepTime,
          quietHoursEnabled: data.preferences.quietHoursEnabled,
          quietHoursStart: data.preferences.quietHoursStart,
          quietHoursEnd: data.preferences.quietHoursEnd,
          maxDailyCheckIns: data.preferences.maxDailyCheckIns,
          defaultPreTaskReminderMin: data.preferences.defaultPreTaskReminderMin,
          randomCheckInsEnabled: data.preferences.randomCheckInsEnabled,
          checkInFrequency: data.preferences.checkInFrequency,
          minMinutesBetweenCheckIns: data.preferences.minMinutesBetweenCheckIns,
        }}
        notifications={notifications}
        pushDevices={pushDevices}
        vapidPublicKey={data.vapidPublicKey}
      />
    </OrbitShell>
  );
}
