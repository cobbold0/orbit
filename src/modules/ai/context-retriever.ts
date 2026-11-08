import { TaskStatus } from "@prisma/client";
import { Temporal } from "temporal-polyfill";
import { prisma } from "@/lib/db/prisma";
import { getLocalWallClockInfo } from "@/lib/time/timezone";

export interface DayScheduleSummary {
  dayName: string;
  dateStr: string;
  isoDayOfWeek: number;
  routinesAndLocations: {
    title: string;
    kind: string;
    physicalLocation: string | null;
    startTime: string;
    endTime: string;
    lifeAreaName: string | null;
  }[];
  scheduledTasks: {
    title: string;
    lifeAreaName: string;
    startTime: string;
    endTime: string;
  }[];
}

export interface UserOrbitContext {
  userId: string;
  ianaTimeZone: string;
  localDate: string;
  localTimeHHmm: string;
  isoDayOfWeek: number;
  todaySchedule: DayScheduleSummary;
  tomorrowSchedule: DayScheduleSummary;
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
        },
        include: { lifeArea: true },
        orderBy: { startTimeLocal: "asc" },
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

  const todayPlain = Temporal.PlainDate.from(wallClock.localDate);
  const tomorrowPlain = todayPlain.add({ days: 1 });
  const dayNames = [
    "",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];

  const buildDaySchedule = (plainDate: Temporal.PlainDate): DayScheduleSummary => {
    const isoDay = plainDate.dayOfWeek;
    const dateStr = plainDate.toString();
    const dayName = dayNames[isoDay] ?? "";

    const routinesForDay = routines
      .filter((r) => r.daysOfWeek.includes(isoDay))
      .map((r) => ({
        title: r.title,
        kind: r.kind,
        physicalLocation: r.physicalLocation,
        startTime: r.startTimeLocal,
        endTime: r.endTimeLocal,
        lifeAreaName: r.lifeArea?.name ?? null,
      }));

    const tasksForDay = tasks
      .filter((t) => {
        if (!t.scheduledStart) return false;
        try {
          const taskInstant = Temporal.Instant.fromEpochMilliseconds(
            t.scheduledStart.getTime()
          );
          const taskZDT = taskInstant.toZonedDateTimeISO(ianaTimeZone);
          return taskZDT.toPlainDate().toString() === dateStr;
        } catch {
          return false;
        }
      })
      .map((t) => {
        const startInstant = Temporal.Instant.fromEpochMilliseconds(
          t.scheduledStart!.getTime()
        );
        const startZDT = startInstant.toZonedDateTimeISO(ianaTimeZone);
        let endStr = "";
        if (t.scheduledEnd) {
          const endInstant = Temporal.Instant.fromEpochMilliseconds(
            t.scheduledEnd.getTime()
          );
          const endZDT = endInstant.toZonedDateTimeISO(ianaTimeZone);
          endStr = `${String(endZDT.hour).padStart(2, "0")}:${String(
            endZDT.minute
          ).padStart(2, "0")}`;
        }
        return {
          title: t.title,
          lifeAreaName: t.lifeArea.name,
          startTime: `${String(startZDT.hour).padStart(2, "0")}:${String(
            startZDT.minute
          ).padStart(2, "0")}`,
          endTime: endStr,
        };
      });

    return {
      dayName,
      dateStr,
      isoDayOfWeek: isoDay,
      routinesAndLocations: routinesForDay,
      scheduledTasks: tasksForDay,
    };
  };

  const todaySchedule = buildDaySchedule(todayPlain);
  const tomorrowSchedule = buildDaySchedule(tomorrowPlain);

  return {
    userId,
    ianaTimeZone,
    localDate: wallClock.localDate,
    localTimeHHmm: wallClock.localTimeHHmm,
    isoDayOfWeek: wallClock.isoDayOfWeek,
    todaySchedule,
    tomorrowSchedule,
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
