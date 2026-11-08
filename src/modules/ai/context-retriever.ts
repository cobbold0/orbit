import { TaskStatus } from "@prisma/client";
import { Temporal } from "temporal-polyfill";
import { prisma } from "@/lib/db/prisma";
import { getLocalDayBoundsUtc, getLocalWallClockInfo } from "@/lib/time/timezone";

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
    notes?: string | null;
  }[];
}

export interface UserOrbitContext {
  userId: string;
  userName: string | null;
  ianaTimeZone: string;
  localDate: string;
  localTimeHHmm: string;
  isoDayOfWeek: number;
  todaySchedule: DayScheduleSummary;
  tomorrowSchedule: DayScheduleSummary;
  upcomingWeekSchedule: DayScheduleSummary[];
  queriedDateSchedule: {
    queryDateStr: string;
    dayName: string;
    isPast: boolean;
    isFuture: boolean;
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
      notes?: string | null;
    }[];
    completedTasks: {
      title: string;
      lifeAreaName: string;
      completedAtIso: string;
    }[];
    pastActivities: {
      title: string;
      lifeAreaName: string | null;
      startedAtIso: string;
      durationMinutes: number | null;
    }[];
  } | null;
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
    milestones: {
      id: string;
      title: string;
      status: string;
      sortOrder: number;
    }[];
  }[];
  openTasks: {
    id: string;
    title: string;
    commitmentType: "SCHEDULED" | "FLEXIBLE" | "WAITING";
    status: string;
    priority: string;
    notes: string | null;
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
  completedTasksToday: {
    id: string;
    title: string;
    lifeAreaName: string;
    completedAtIso: string;
  }[];
  recentCompletedTasks: {
    id: string;
    title: string;
    lifeAreaName: string;
    completedAtIso: string;
  }[];
  recentInboxNotes: {
    id: string;
    title: string | null;
    summary: string | null;
    rawSnippet: string;
    createdAtIso: string;
  }[];
  pendingCheckIns: {
    id: string;
    title: string;
    body: string;
    actionUrl: string;
    deliveredAtIso: string | null;
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

const monthMap: Record<string, number> = {
  january: 1, jan: 1,
  february: 2, feb: 2,
  march: 3, mar: 3,
  april: 4, apr: 4,
  may: 5,
  june: 6, jun: 6,
  july: 7, jul: 7,
  august: 8, aug: 8,
  september: 9, sep: 9, sept: 9,
  october: 10, oct: 10,
  november: 11, nov: 11,
  december: 12, dec: 12,
};

const dayNameMap: Record<string, number> = {
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
  sunday: 7, sun: 7,
};

export function parseTargetDateFromQuery(
  query: string,
  localDateStr: string
): { targetDate: Temporal.PlainDate; explicitYear: boolean } | null {
  const lower = query.toLowerCase().trim();
  const todayPlain = Temporal.PlainDate.from(localDateStr);

  if (/\byesterday\b/i.test(lower)) {
    return { targetDate: todayPlain.subtract({ days: 1 }), explicitYear: true };
  }

  if (/\btomorrow\b/i.test(lower)) {
    return { targetDate: todayPlain.add({ days: 1 }), explicitYear: true };
  }

  if (/\b(?:today|tonight)\b/i.test(lower)) {
    return { targetDate: todayPlain, explicitYear: true };
  }

  // Format A: e.g. "24th December", "24th of December", "24th December 2026", "24 Dec"
  const dayMonthRegex = /\b(\d{1,2})(?:st|nd|rd|th)?(?:\s+(?:of\s+)?)(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)(?:,?\s+(\d{4}))?\b/i;
  const matchA = lower.match(dayMonthRegex);
  if (matchA) {
    const day = parseInt(matchA[1]!, 10);
    const month = monthMap[matchA[2]!.toLowerCase()]!;
    const year = matchA[3] ? parseInt(matchA[3], 10) : todayPlain.year;
    try {
      let candidate = Temporal.PlainDate.from({ year, month, day });
      if (!matchA[3] && Temporal.PlainDate.compare(candidate, todayPlain) < 0) {
        candidate = Temporal.PlainDate.from({ year: todayPlain.year + 1, month, day });
      }
      return { targetDate: candidate, explicitYear: Boolean(matchA[3]) };
    } catch {
      // Invalid date
    }
  }

  // Format B: e.g. "December 24th, 2026", "January 1st, 2024", "Dec 24"
  const monthDayRegex = /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/i;
  const matchB = lower.match(monthDayRegex);
  if (matchB) {
    const month = monthMap[matchB[1]!.toLowerCase()]!;
    const day = parseInt(matchB[2]!, 10);
    const year = matchB[3] ? parseInt(matchB[3], 10) : todayPlain.year;
    try {
      let candidate = Temporal.PlainDate.from({ year, month, day });
      if (!matchB[3] && Temporal.PlainDate.compare(candidate, todayPlain) < 0) {
        candidate = Temporal.PlainDate.from({ year: todayPlain.year + 1, month, day });
      }
      return { targetDate: candidate, explicitYear: Boolean(matchB[3]) };
    } catch {
      // Invalid date
    }
  }

  // Format C: ISO YYYY-MM-DD
  const isoMatch = lower.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoMatch) {
    try {
      return {
        targetDate: Temporal.PlainDate.from({
          year: parseInt(isoMatch[1]!, 10),
          month: parseInt(isoMatch[2]!, 10),
          day: parseInt(isoMatch[3]!, 10),
        }),
        explicitYear: true,
      };
    } catch {
      // Invalid date
    }
  }

  // Format D: Weekday names e.g. "Wednesday", "this Friday", "next Monday"
  for (const [name, targetIsoDay] of Object.entries(dayNameMap)) {
    const reg = new RegExp(`\\b${name}\\b`, "i");
    if (reg.test(lower)) {
      if (/\blast\s+/i.test(lower)) {
        const delta = (todayPlain.dayOfWeek - targetIsoDay + 7) % 7 || 7;
        return { targetDate: todayPlain.subtract({ days: delta }), explicitYear: false };
      }
      const delta = (targetIsoDay - todayPlain.dayOfWeek + 7) % 7 || 7;
      return { targetDate: todayPlain.add({ days: delta }), explicitYear: false };
    }
  }

  return null;
}

/**
 * Retrieves the authenticated user's structured life context from PostgreSQL.
 * Strictly separates confirmed facts from unconfirmed inferences.
 */
export async function retrieveUserOrbitContext(
  userId: string,
  nowUtc = new Date(),
  targetQuery?: string
): Promise<UserOrbitContext> {
  const [
    user,
    pref,
    lifeAreas,
    projects,
    tasks,
    allCompletedTasks,
    routines,
    activities,
    inboxNotes,
    checkIns,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    }),
    prisma.userPreference.findUnique({ where: { userId } }),
    prisma.lifeArea.findMany({
      where: { userId, isArchived: false },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.project.findMany({
      where: { userId, status: "ACTIVE" },
      include: {
        lifeArea: true,
        milestones: {
          orderBy: { sortOrder: "asc" },
          select: { id: true, title: true, status: true, sortOrder: true },
        },
      },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.task.findMany({
      where: {
        userId,
        status: { notIn: [TaskStatus.COMPLETED, TaskStatus.ARCHIVED] },
      },
      include: { lifeArea: true, project: true },
      orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
      take: 50,
    }),
    prisma.task.findMany({
      where: { userId, status: TaskStatus.COMPLETED },
      include: { lifeArea: true },
      orderBy: { updatedAt: "desc" },
      take: 20,
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
      take: 15,
    }),
    prisma.memoryInboxEntry.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        title: true,
        aiSummary: true,
        rawContent: true,
        createdAt: true,
      },
    }),
    prisma.notification.findMany({
      where: { userId, status: "DELIVERED" },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        title: true,
        body: true,
        actionUrl: true,
        deliveredAt: true,
      },
    }),
  ]);

  const ianaTimeZone = pref?.ianaTimeZone ?? "Africa/Lagos";
  const wallClock = getLocalWallClockInfo(nowUtc, ianaTimeZone);
  const todayPlain = Temporal.PlainDate.from(wallClock.localDate);

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
          notes: t.contextNotes ?? null,
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

  // Build upcoming 7 days lookahead
  const upcomingWeekSchedule: DayScheduleSummary[] = [];
  for (let i = 0; i < 7; i++) {
    upcomingWeekSchedule.push(buildDaySchedule(todayPlain.add({ days: i })));
  }

  const todaySchedule = upcomingWeekSchedule[0]!;
  const tomorrowSchedule = upcomingWeekSchedule[1]!;

  // Completed tasks today
  const { startUtc: todayStartUtc, endUtc: todayEndUtc } = getLocalDayBoundsUtc(
    wallClock.localDate,
    ianaTimeZone
  );
  const completedTasksToday = allCompletedTasks
    .filter((t) => t.updatedAt >= todayStartUtc && t.updatedAt <= todayEndUtc)
    .map((t) => ({
      id: t.id,
      title: t.title,
      lifeAreaName: t.lifeArea.name,
      completedAtIso: t.updatedAt.toISOString(),
    }));

  // Resolve target date if mentioned in query
  let queriedDateSchedule: UserOrbitContext["queriedDateSchedule"] = null;
  const parsedTarget = targetQuery
    ? parseTargetDateFromQuery(targetQuery, wallClock.localDate)
    : null;

  if (parsedTarget) {
    const targetDateStr = parsedTarget.targetDate.toString();
    const isPast =
      Temporal.PlainDate.compare(parsedTarget.targetDate, todayPlain) < 0;
    const isFuture =
      Temporal.PlainDate.compare(parsedTarget.targetDate, todayPlain) > 0;
    const targetIsoDay = parsedTarget.targetDate.dayOfWeek;
    const dayBounds = getLocalDayBoundsUtc(targetDateStr, ianaTimeZone);

    let pastActivitiesForDay: UserOrbitContext["recentConfirmedActivities"] = [];
    let pastCompletedTasksForDay: UserOrbitContext["completedTasksToday"] = [];
    let targetTasksForDay: DayScheduleSummary["scheduledTasks"] = [];

    if (isPast) {
      const [pastActs, pastDone] = await Promise.all([
        prisma.activityRecord.findMany({
          where: {
            userId,
            startedAt: { gte: dayBounds.startUtc, lte: dayBounds.endUtc },
          },
          include: { lifeArea: true },
          orderBy: { startedAt: "asc" },
        }),
        prisma.task.findMany({
          where: {
            userId,
            status: TaskStatus.COMPLETED,
            updatedAt: { gte: dayBounds.startUtc, lte: dayBounds.endUtc },
          },
          include: { lifeArea: true },
          orderBy: { updatedAt: "asc" },
        }),
      ]);

      pastActivitiesForDay = pastActs.map((a) => ({
        id: a.id,
        title: a.title,
        startedAtIso: a.startedAt.toISOString(),
        durationMinutes: a.durationMinutes,
        lifeAreaName: a.lifeArea?.name ?? null,
      }));

      pastCompletedTasksForDay = pastDone.map((t) => ({
        id: t.id,
        title: t.title,
        lifeAreaName: t.lifeArea.name,
        completedAtIso: t.updatedAt.toISOString(),
      }));
    } else {
      // Future or today scheduled tasks from DB
      const futureTasks = await prisma.task.findMany({
        where: {
          userId,
          OR: [
            {
              scheduledStart: {
                gte: dayBounds.startUtc,
                lte: dayBounds.endUtc,
              },
            },
            {
              dueDate: {
                gte: dayBounds.startUtc,
                lte: dayBounds.endUtc,
              },
            },
          ],
        },
        include: { lifeArea: true },
      });

      targetTasksForDay = futureTasks.map((t) => {
        let startStr = "";
        let endStr = "";
        if (t.scheduledStart) {
          const zdt = Temporal.Instant.fromEpochMilliseconds(
            t.scheduledStart.getTime()
          ).toZonedDateTimeISO(ianaTimeZone);
          startStr = `${String(zdt.hour).padStart(2, "0")}:${String(
            zdt.minute
          ).padStart(2, "0")}`;
        }
        if (t.scheduledEnd) {
          const zdt = Temporal.Instant.fromEpochMilliseconds(
            t.scheduledEnd.getTime()
          ).toZonedDateTimeISO(ianaTimeZone);
          endStr = `${String(zdt.hour).padStart(2, "0")}:${String(
            zdt.minute
          ).padStart(2, "0")}`;
        }
        return {
          title: t.title,
          lifeAreaName: t.lifeArea.name,
          startTime: startStr,
          endTime: endStr,
          notes: t.contextNotes ?? null,
        };
      });
    }

    const targetRoutines = routines
      .filter((r) => r.daysOfWeek.includes(targetIsoDay))
      .map((r) => ({
        title: r.title,
        kind: r.kind,
        physicalLocation: r.physicalLocation,
        startTime: r.startTimeLocal,
        endTime: r.endTimeLocal,
        lifeAreaName: r.lifeArea?.name ?? null,
      }));

    queriedDateSchedule = {
      queryDateStr: targetDateStr,
      dayName: dayNames[targetIsoDay] ?? "",
      isPast,
      isFuture,
      routinesAndLocations: targetRoutines,
      scheduledTasks: targetTasksForDay,
      completedTasks: pastCompletedTasksForDay,
      pastActivities: pastActivitiesForDay.map((a) => ({
        title: a.title,
        lifeAreaName: a.lifeAreaName,
        startedAtIso: a.startedAtIso,
        durationMinutes: a.durationMinutes,
      })),
    };
  }

  return {
    userId,
    userName: user?.name || null,
    ianaTimeZone,
    localDate: wallClock.localDate,
    localTimeHHmm: wallClock.localTimeHHmm,
    isoDayOfWeek: wallClock.isoDayOfWeek,
    todaySchedule,
    tomorrowSchedule,
    upcomingWeekSchedule,
    queriedDateSchedule,
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
      milestones: p.milestones.map((m) => ({
        id: m.id,
        title: m.title,
        status: m.status,
        sortOrder: m.sortOrder,
      })),
    })),
    openTasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      commitmentType: t.commitmentType,
      status: t.status,
      priority: t.priority,
      notes: t.contextNotes,
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
    completedTasksToday,
    recentCompletedTasks: allCompletedTasks.map((t) => ({
      id: t.id,
      title: t.title,
      lifeAreaName: t.lifeArea.name,
      completedAtIso: t.updatedAt.toISOString(),
    })),
    recentInboxNotes: inboxNotes.map((n) => ({
      id: n.id,
      title: n.title,
      summary: n.aiSummary,
      rawSnippet: n.rawContent.slice(0, 150),
      createdAtIso: n.createdAt.toISOString(),
    })),
    pendingCheckIns: checkIns.map((c) => ({
      id: c.id,
      title: c.title,
      body: c.body,
      actionUrl: c.actionUrl,
      deliveredAtIso: c.deliveredAt?.toISOString() ?? null,
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
