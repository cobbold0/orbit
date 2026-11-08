import {
  CommitmentType,
  InboxProcessingStatus,
  RoutineState,
  TaskStatus,
} from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  getLocalDayBoundsUtc,
  getLocalWallClockInfo,
} from "@/lib/time/timezone";

export async function getNowOverviewData(userId: string, nowUtc = new Date()) {
  const pref = await prisma.userPreference.findUnique({
    where: { userId },
  });
  const ianaTimeZone = pref?.ianaTimeZone ?? "Africa/Lagos";

  // 1. Principle #4: Reconcile any elapsed SCHEDULED commitments to NEEDS_CHECKIN
  // Never assume a task is complete because its scheduled time has passed!
  await prisma.task.updateMany({
    where: {
      userId,
      commitmentType: CommitmentType.SCHEDULED,
      status: { in: [TaskStatus.ACTIVE, TaskStatus.IN_PROGRESS] },
      scheduledEnd: { lte: nowUtc },
    },
    data: {
      status: TaskStatus.NEEDS_CHECKIN,
    },
  });

  const wallClock = getLocalWallClockInfo(nowUtc, ianaTimeZone);
  const dayBounds = getLocalDayBoundsUtc(wallClock.localDate, ianaTimeZone);

  const [
    lifeAreas,
    projects,
    declaredRoutines,
    suggestedRoutines,
    scheduledToday,
    needsCheckInTasks,
    flexibleTasks,
    waitingTasks,
    upcomingDeadlines,
    todayActivities,
    unreviewedInbox,
  ] = await Promise.all([
    prisma.lifeArea.findMany({
      where: { userId, isArchived: false },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.project.findMany({
      where: { userId, status: "ACTIVE" },
      include: { lifeArea: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.routine.findMany({
      where: {
        userId,
        isActive: true,
        state: RoutineState.DECLARED,
      },
      include: { lifeArea: true },
    }),
    prisma.routine.findMany({
      where: {
        userId,
        isActive: true,
        state: RoutineState.SUGGESTED,
      },
      include: { lifeArea: true },
    }),
    prisma.task.findMany({
      where: {
        userId,
        commitmentType: CommitmentType.SCHEDULED,
        status: { in: [TaskStatus.ACTIVE, TaskStatus.IN_PROGRESS] },
        scheduledStart: { lt: dayBounds.endUtc },
        scheduledEnd: { gt: dayBounds.startUtc },
      },
      include: { lifeArea: true, project: true },
      orderBy: { scheduledStart: "asc" },
    }),
    prisma.task.findMany({
      where: {
        userId,
        status: TaskStatus.NEEDS_CHECKIN,
      },
      include: { lifeArea: true, project: true },
      orderBy: { scheduledEnd: "asc" },
    }),
    prisma.task.findMany({
      where: {
        userId,
        commitmentType: CommitmentType.FLEXIBLE,
        status: { in: [TaskStatus.ACTIVE, TaskStatus.IN_PROGRESS] },
      },
      include: { lifeArea: true, project: true, milestone: true },
      orderBy: [{ priority: "desc" }, { dueDate: "asc" }, { createdAt: "desc" }],
      take: 6,
    }),
    prisma.task.findMany({
      where: {
        userId,
        commitmentType: CommitmentType.WAITING,
        status: TaskStatus.ACTIVE,
      },
      include: { lifeArea: true, project: true },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
    prisma.task.findMany({
      where: {
        userId,
        status: { notIn: [TaskStatus.COMPLETED, TaskStatus.ARCHIVED] },
        dueDate: {
          gte: dayBounds.startUtc,
          lte: new Date(dayBounds.endUtc.getTime() + 7 * 24 * 60 * 60 * 1000),
        },
      },
      include: { lifeArea: true, project: true },
      orderBy: { dueDate: "asc" },
      take: 5,
    }),
    prisma.activityRecord.findMany({
      where: {
        userId,
        startedAt: { gte: dayBounds.startUtc, lt: dayBounds.endUtc },
      },
      include: { lifeArea: true, project: true },
      orderBy: { startedAt: "desc" },
      take: 8,
    }),
    prisma.memoryInboxEntry.findMany({
      where: {
        userId,
        processingStatus: {
          in: [
            InboxProcessingStatus.RAW_UNPROCESSED,
            InboxProcessingStatus.EXTRACTED_PENDING_REVIEW,
          ],
        },
      },
      include: {
        extractedActions: {
          where: { reviewStatus: "PENDING_REVIEW" },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 3,
    }),
  ]);

  // Filter routines that apply to today's ISO day of week
  const todayRoutines = declaredRoutines.filter((r) =>
    r.daysOfWeek.includes(wallClock.isoDayOfWeek)
  );

  // Determine current active location context window (if any)
  const activeLocationRoutine =
    todayRoutines.find(
      (r) =>
        r.kind === "LOCATION_WINDOW" &&
        r.startTimeLocal <= wallClock.localTimeHHmm &&
        r.endTimeLocal >= wallClock.localTimeHHmm
    ) ?? todayRoutines.find((r) => r.kind === "LOCATION_WINDOW");

  // Determine active commitment vs next commitment
  const activeCommitment =
    scheduledToday.find(
      (t) =>
        t.status === TaskStatus.IN_PROGRESS ||
        (t.scheduledStart &&
          t.scheduledEnd &&
          t.scheduledStart <= nowUtc &&
          t.scheduledEnd > nowUtc)
    ) ?? null;

  const nextCommitment =
    scheduledToday.find(
      (t) =>
        t.id !== activeCommitment?.id &&
        t.scheduledStart &&
        t.scheduledStart > nowUtc
    ) ?? null;

  return {
    ianaTimeZone,
    wallClock,
    lifeAreas,
    projects,
    todayRoutines,
    activeLocationRoutine,
    suggestedRoutines,
    activeCommitment,
    nextCommitment,
    scheduledToday,
    needsCheckInTasks,
    flexibleTasks,
    waitingTasks,
    upcomingDeadlines,
    todayActivities,
    unreviewedInbox,
  };
}
