import { CommitmentType, RoutineState, TaskStatus } from "@prisma/client";
import { Temporal } from "temporal-polyfill";
import { prisma } from "@/lib/db/prisma";
import {
  formatTimeInZone,
  getLocalDayBoundsUtc,
  getLocalWallClockInfo,
  resolveLocalDateTimeToUtc,
} from "@/lib/time/timezone";

export interface AvailableTimeWindow {
  startUtc: Date;
  endUtc: Date;
  startLabel: string;
  endLabel: string;
  durationMinutes: number;
  startTimeLocalHHmm: string;
}

export interface TimelineDayModel {
  dateStr: string;
  dayNameShort: string;
  dayNumber: number;
  monthShort: string;
  isToday: boolean;
  isoDayOfWeek: number;
  locationContexts: {
    id: string;
    title: string;
    physicalLocation: string | null;
    startTimeLocal: string;
    endTimeLocal: string;
    lifeAreaName: string | null;
    colorToken: string;
  }[];
  scheduledCommitments: {
    id: string;
    title: string;
    status: TaskStatus;
    scheduledStart: Date;
    scheduledEnd: Date;
    startLabel: string;
    endLabel: string;
    durationMinutes: number;
    lifeAreaId: string;
    lifeAreaName: string;
    colorToken: string;
    projectTitle: string | null;
  }[];
  availableWindows: AvailableTimeWindow[];
  observedActivities: {
    id: string;
    title: string;
    physicalLocation: string | null;
    startedAt: Date;
    startLabel: string;
    durationMinutes: number | null;
    isConfirmed: boolean;
    source: string;
    lifeAreaName: string | null;
    colorToken: string;
  }[];
}

/**
 * Computes open personal availability windows between scheduled commitments
 * within the user's waking day (08:00 to 21:00 local time).
 */
export function computeAvailableWindowsForDay(
  localDateStr: string,
  ianaTimeZone: string,
  commitments: { scheduledStart: Date; scheduledEnd: Date }[]
): AvailableTimeWindow[] {
  const dayWakeStart = resolveLocalDateTimeToUtc(
    localDateStr,
    "08:00",
    ianaTimeZone
  ).instantUtc;
  const dayWakeEnd = resolveLocalDateTimeToUtc(
    localDateStr,
    "21:00",
    ianaTimeZone
  ).instantUtc;

  const sorted = [...commitments]
    .filter(
      (c) => c.scheduledEnd > dayWakeStart && c.scheduledStart < dayWakeEnd
    )
    .sort((a, b) => a.scheduledStart.getTime() - b.scheduledStart.getTime());

  const windows: AvailableTimeWindow[] = [];
  let cursor = dayWakeStart;

  for (const item of sorted) {
    const blockStart =
      item.scheduledStart < dayWakeStart ? dayWakeStart : item.scheduledStart;
    const blockEnd =
      item.scheduledEnd > dayWakeEnd ? dayWakeEnd : item.scheduledEnd;

    const gapMinutes = Math.round(
      (blockStart.getTime() - cursor.getTime()) / (60 * 1000)
    );
    if (gapMinutes >= 30) {
      const localClock = getLocalWallClockInfo(cursor, ianaTimeZone);
      windows.push({
        startUtc: cursor,
        endUtc: blockStart,
        startLabel: formatTimeInZone(cursor, ianaTimeZone),
        endLabel: formatTimeInZone(blockStart, ianaTimeZone),
        durationMinutes: gapMinutes,
        startTimeLocalHHmm: localClock.localTimeHHmm,
      });
    }

    if (blockEnd > cursor) {
      cursor = blockEnd;
    }
  }

  const trailingMinutes = Math.round(
    (dayWakeEnd.getTime() - cursor.getTime()) / (60 * 1000)
  );
  if (trailingMinutes >= 30) {
    const localClock = getLocalWallClockInfo(cursor, ianaTimeZone);
    windows.push({
      startUtc: cursor,
      endUtc: dayWakeEnd,
      startLabel: formatTimeInZone(cursor, ianaTimeZone),
      endLabel: formatTimeInZone(dayWakeEnd, ianaTimeZone),
      durationMinutes: trailingMinutes,
      startTimeLocalHHmm: localClock.localTimeHHmm,
    });
  }

  return windows;
}

export async function getUnifiedTimelineData(
  userId: string,
  targetDateStr?: string,
  nowUtc = new Date()
) {
  const pref = await prisma.userPreference.findUnique({ where: { userId } });
  const ianaTimeZone = pref?.ianaTimeZone ?? "Africa/Lagos";

  const todayInfo = getLocalWallClockInfo(nowUtc, ianaTimeZone);
  const focalDateStr = targetDateStr ?? todayInfo.localDate;
  const focalPlain = Temporal.PlainDate.from(focalDateStr);

  // Build 7-day week starting from Monday of the focal date's week
  const daysFromMonday = focalPlain.dayOfWeek - 1;
  const weekStartPlain = focalPlain.subtract({ days: daysFromMonday });
  const weekDates: Temporal.PlainDate[] = [];
  for (let i = 0; i < 7; i++) {
    weekDates.push(weekStartPlain.add({ days: i }));
  }

  const weekStartBounds = getLocalDayBoundsUtc(
    weekDates[0]!.toString(),
    ianaTimeZone
  );
  const weekEndBounds = getLocalDayBoundsUtc(
    weekDates[6]!.toString(),
    ianaTimeZone
  );

  const [
    lifeAreas,
    routines,
    scheduledTasks,
    flexibleTasks,
    waitingTasks,
    activities,
  ] = await Promise.all([
    prisma.lifeArea.findMany({
      where: { userId, isArchived: false },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.routine.findMany({
      where: { userId, isActive: true, state: RoutineState.DECLARED },
      include: { lifeArea: true },
    }),
    prisma.task.findMany({
      where: {
        userId,
        commitmentType: CommitmentType.SCHEDULED,
        status: { not: TaskStatus.ARCHIVED },
        scheduledStart: { lt: weekEndBounds.endUtc },
        scheduledEnd: { gt: weekStartBounds.startUtc },
      },
      include: { lifeArea: true, project: true },
      orderBy: { scheduledStart: "asc" },
    }),
    prisma.task.findMany({
      where: {
        userId,
        commitmentType: CommitmentType.FLEXIBLE,
        status: { in: [TaskStatus.ACTIVE, TaskStatus.IN_PROGRESS] },
      },
      include: { lifeArea: true, project: true },
      orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
    }),
    prisma.task.findMany({
      where: {
        userId,
        commitmentType: CommitmentType.WAITING,
        status: TaskStatus.ACTIVE,
      },
      include: { lifeArea: true, project: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.activityRecord.findMany({
      where: {
        userId,
        startedAt: {
          gte: weekStartBounds.startUtc,
          lt: weekEndBounds.endUtc,
        },
      },
      include: { lifeArea: true },
      orderBy: { startedAt: "asc" },
    }),
  ]);

  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  const days: TimelineDayModel[] = weekDates.map((dPlain) => {
    const dStr = dPlain.toString();
    const bounds = getLocalDayBoundsUtc(dStr, ianaTimeZone);

    const dayLocations = routines
      .filter((r) => r.daysOfWeek.includes(dPlain.dayOfWeek))
      .map((r) => ({
        id: r.id,
        title: r.title,
        physicalLocation: r.physicalLocation,
        startTimeLocal: r.startTimeLocal,
        endTimeLocal: r.endTimeLocal,
        lifeAreaName: r.lifeArea?.name ?? null,
        colorToken: r.lifeArea?.colorToken ?? "slate",
      }));

    const dayScheduled = scheduledTasks
      .filter(
        (t) =>
          t.scheduledStart &&
          t.scheduledEnd &&
          t.scheduledStart < bounds.endUtc &&
          t.scheduledEnd > bounds.startUtc
      )
      .map((t) => {
        const start = t.scheduledStart!;
        const end = t.scheduledEnd!;
        const dur = Math.max(
          15,
          Math.round((end.getTime() - start.getTime()) / (60 * 1000))
        );
        return {
          id: t.id,
          title: t.title,
          status: t.status,
          scheduledStart: start,
          scheduledEnd: end,
          startLabel: formatTimeInZone(start, ianaTimeZone),
          endLabel: formatTimeInZone(end, ianaTimeZone),
          durationMinutes: dur,
          lifeAreaId: t.lifeAreaId,
          lifeAreaName: t.lifeArea.name,
          colorToken: t.lifeArea.colorToken,
          projectTitle: t.project?.title ?? null,
        };
      });

    const availableWindows = computeAvailableWindowsForDay(
      dStr,
      ianaTimeZone,
      dayScheduled
    );

    const dayActivities = activities
      .filter(
        (a) => a.startedAt >= bounds.startUtc && a.startedAt < bounds.endUtc
      )
      .map((a) => ({
        id: a.id,
        title: a.title,
        physicalLocation: a.physicalLocation,
        startedAt: a.startedAt,
        startLabel: formatTimeInZone(a.startedAt, ianaTimeZone),
        durationMinutes: a.durationMinutes,
        isConfirmed: a.isConfirmed,
        source: a.source,
        lifeAreaName: a.lifeArea?.name ?? null,
        colorToken: a.lifeArea?.colorToken ?? "slate",
      }));

    return {
      dateStr: dStr,
      dayNameShort: dayNames[dPlain.dayOfWeek - 1] ?? "Day",
      dayNumber: dPlain.day,
      monthShort: monthNames[dPlain.month - 1] ?? "",
      isToday: dStr === todayInfo.localDate,
      isoDayOfWeek: dPlain.dayOfWeek,
      locationContexts: dayLocations,
      scheduledCommitments: dayScheduled,
      availableWindows,
      observedActivities: dayActivities,
    };
  });

  const focalDay = days.find((d) => d.dateStr === focalDateStr) ?? days[0]!;

  return {
    ianaTimeZone,
    todayDateStr: todayInfo.localDate,
    focalDateStr,
    previousWeekDateStr: focalPlain.subtract({ days: 7 }).toString(),
    nextWeekDateStr: focalPlain.add({ days: 7 }).toString(),
    lifeAreas,
    days,
    focalDay,
    flexibleTasks,
    waitingTasks,
  };
}
