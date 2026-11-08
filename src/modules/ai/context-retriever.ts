import { RoutineState, TaskStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getLocalWallClockInfo } from "@/lib/time/timezone";

export interface UserOrbitContext {
  userId: string;
  ianaTimeZone: string;
  localDate: string;
  localTimeHHmm: string;
  isoDayOfWeek: number;
  userPreferences: {
    declaredWakeTime: string;
    declaredSleepTime: string;
    quietHoursEnabled: boolean;
    quietHoursStart: string;
    quietHoursEnd: string;
    checkInFrequency: string;
    maxDailyCheckIns: number;
    defaultPreTaskReminderMin: number;
  };
  lifeAreas: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
  }[];
  activeProjects: {
    id: string;
    title: string;
    kind: string;
    lifeAreaId: string;
    lifeAreaSlug: string;
    lifeAreaName: string;
  }[];
  openTasks: {
    id: string;
    title: string;
    commitmentType: "SCHEDULED" | "FLEXIBLE" | "WAITING";
    status: string;
    lifeAreaId: string;
    lifeAreaName: string;
    lifeAreaSlug: string;
    projectId: string | null;
    projectTitle: string | null;
    scheduledStartIso: string | null;
    scheduledEndIso: string | null;
    dueDateIso: string | null;
    estimatedMinutes: number | null;
    flexibilityWindow: string | null;
    waitingOnPerson: string | null;
  }[];
  declaredRoutines: {
    id: string;
    title: string;
    kind: string;
    physicalLocation: string | null;
    daysOfWeek: number[];
    startTimeLocal: string;
    endTimeLocal: string;
    lifeAreaName: string | null;
  }[];
  recentConfirmedActivities: {
    id: string;
    title: string;
    startedAtIso: string;
    durationMinutes: number | null;
    lifeAreaName: string | null;
  }[];
}

/**
 * Retrieves the authenticated user's structured life context from PostgreSQL.
 * Strictly separates confirmed facts from unconfirmed inferences.
 */
export async function retrieveUserOrbitContext(
  userId: string,
  nowUtc = new Date()
): Promise<UserOrbitContext> {
  const [pref, lifeAreas, projects, tasks, routines, activities] =
    await Promise.all([
      prisma.userPreference.findUnique({ where: { userId } }),
      prisma.lifeArea.findMany({
        where: { userId, isArchived: false },
        orderBy: { sortOrder: "asc" },
      }),
      prisma.project.findMany({
        where: { userId, status: "ACTIVE" },
        include: { lifeArea: true },
        orderBy: { sortOrder: "asc" },
      }),
      prisma.task.findMany({
        where: {
          userId,
          status: { notIn: [TaskStatus.COMPLETED, TaskStatus.ARCHIVED] },
        },
        include: { lifeArea: true, project: true },
        orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
        take: 40,
      }),
      prisma.routine.findMany({
        where: {
          userId,
          isActive: true,
          state: RoutineState.DECLARED,
        },
        include: { lifeArea: true },
      }),
      prisma.activityRecord.findMany({
        where: { userId, isConfirmed: true },
        include: { lifeArea: true },
        orderBy: { startedAt: "desc" },
        take: 10,
      }),
    ]);

  const ianaTimeZone = pref?.ianaTimeZone ?? "Africa/Lagos";
  const wallClock = getLocalWallClockInfo(nowUtc, ianaTimeZone);

  return {
    userId,
    ianaTimeZone,
    localDate: wallClock.localDate,
    localTimeHHmm: wallClock.localTimeHHmm,
    isoDayOfWeek: wallClock.isoDayOfWeek,
    userPreferences: {
      declaredWakeTime: pref?.declaredWakeTime ?? "07:30",
      declaredSleepTime: pref?.declaredSleepTime ?? "23:00",
      quietHoursEnabled: pref?.quietHoursEnabled ?? true,
      quietHoursStart: pref?.quietHoursStart ?? "22:00",
      quietHoursEnd: pref?.quietHoursEnd ?? "07:00",
      checkInFrequency: pref?.checkInFrequency ?? "BALANCED",
      maxDailyCheckIns: pref?.maxDailyCheckIns ?? 3,
      defaultPreTaskReminderMin: pref?.defaultPreTaskReminderMin ?? 30,
    },
    lifeAreas: lifeAreas.map((a) => ({
      id: a.id,
      name: a.name,
      slug: a.slug,
      description: a.description,
    })),
    activeProjects: projects.map((p) => ({
      id: p.id,
      title: p.title,
      kind: p.kind,
      lifeAreaId: p.lifeAreaId,
      lifeAreaSlug: p.lifeArea.slug,
      lifeAreaName: p.lifeArea.name,
    })),
    openTasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      commitmentType: t.commitmentType,
      status: t.status,
      lifeAreaId: t.lifeAreaId,
      lifeAreaName: t.lifeArea.name,
      lifeAreaSlug: t.lifeArea.slug,
      projectId: t.projectId,
      projectTitle: t.project?.title ?? null,
      scheduledStartIso: t.scheduledStart?.toISOString() ?? null,
      scheduledEndIso: t.scheduledEnd?.toISOString() ?? null,
      dueDateIso: t.dueDate?.toISOString() ?? null,
      estimatedMinutes: t.estimatedMinutes,
      flexibilityWindow: t.flexibilityWindow,
      waitingOnPerson: t.waitingOnPerson,
    })),
    declaredRoutines: routines.map((r) => ({
      id: r.id,
      title: r.title,
      kind: r.kind,
      physicalLocation: r.physicalLocation,
      daysOfWeek: r.daysOfWeek,
      startTimeLocal: r.startTimeLocal,
      endTimeLocal: r.endTimeLocal,
      lifeAreaName: r.lifeArea?.name ?? null,
    })),
    recentConfirmedActivities: activities.map((a) => ({
      id: a.id,
      title: a.title,
      startedAtIso: a.startedAt.toISOString(),
      durationMinutes: a.durationMinutes,
      lifeAreaName: a.lifeArea?.name ?? null,
    })),
  };
}
