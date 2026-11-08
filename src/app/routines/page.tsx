import { getCurrentUser } from "@/lib/auth/session";
import { getActivityAndRoutinesData } from "@/modules/activity/activity-service";
import { OrbitShell } from "@/components/shell/orbit-shell";
import {
  ActivityClient,
  type ActivityHistoryItem,
  type AreaDistributionItem,
  type RoutineItem,
} from "@/components/activity/activity-client";
import {
  formatClock,
  formatDays,
  formatDuration,
  formatShortDate,
} from "@/lib/time/format";
import { prisma } from "@/lib/db/prisma";
import { getShellBadgeCounts } from "@/lib/shell-data";

export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const [data, projects, badges] = await Promise.all([
    getActivityAndRoutinesData(user.id),
    prisma.project.findMany({
      where: { userId: user.id, status: "ACTIVE" },
      select: { id: true, title: true, lifeAreaId: true },
    }),
    getShellBadgeCounts(user.id),
  ]);

  const tz = data.ianaTimeZone;
  const areaOptions = data.lifeAreas.map((a) => ({ id: a.id, name: a.name }));
  const slugByAreaId = new Map(data.lifeAreas.map((a) => [a.id, a.slug]));

  const distribution: AreaDistributionItem[] = data.areaDistribution.map(
    (d) => ({
      lifeAreaId: d.lifeAreaId,
      name: d.name,
      slug: slugByAreaId.get(d.lifeAreaId),
      colorToken: d.colorToken,
      confirmedMinutes: d.confirmedMinutes,
      confirmedLabel: formatDuration(d.confirmedMinutes),
      inferredMinutes: d.inferredMinutes,
      inferredLabel: formatDuration(d.inferredMinutes),
    })
  );

  const history: ActivityHistoryItem[] = data.activityRecords.map((rec) => ({
    id: rec.id,
    title: rec.title,
    whenLabel: `${formatShortDate(rec.startedAt, tz)}, ${formatClock(
      rec.startedAt,
      tz
    )}`,
    durationLabel: rec.durationMinutes
      ? formatDuration(rec.durationMinutes)
      : null,
    isConfirmed: rec.isConfirmed,
    lifeArea: rec.lifeArea
      ? {
          name: rec.lifeArea.name,
          colorToken: rec.lifeArea.colorToken,
        }
      : null,
  }));

  const declaredRoutines: RoutineItem[] = data.declaredRoutines.map((r) => ({
    id: r.id,
    title: r.title,
    daysLabel: formatDays(r.daysOfWeek),
    timeRangeLabel: `${r.startTimeLocal} to ${r.endTimeLocal}`,
    physicalLocation: r.physicalLocation,
    lifeArea: r.lifeArea
      ? {
          name: r.lifeArea.name,
          colorToken: r.lifeArea.colorToken,
        }
      : null,
  }));

  const suggestedRoutines: RoutineItem[] = data.suggestedRoutines.map((r) => ({
    id: r.id,
    title: r.title,
    daysLabel: formatDays(r.daysOfWeek),
    timeRangeLabel: `${r.startTimeLocal} to ${r.endTimeLocal}`,
    physicalLocation: r.physicalLocation,
    suggestionReasoning: r.suggestionReasoning,
    lifeArea: null,
  }));

  return (
    <OrbitShell
      lifeAreas={data.lifeAreas}
      projects={projects}
      unreviewedInboxCount={badges.unreviewedInboxCount}
      unreadCheckInCount={badges.unreadCheckInCount}
      user={{
        name: user.name,
        email: user.email,
      }}
    >
      <ActivityClient
        areaOptions={areaOptions}
        distribution={distribution}
        history={history}
        declaredRoutines={declaredRoutines}
        suggestedRoutines={suggestedRoutines}
      />
    </OrbitShell>
  );
}
