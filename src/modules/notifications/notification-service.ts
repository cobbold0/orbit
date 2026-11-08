import crypto from "node:crypto";
import {
  BackgroundJobKind,
  BackgroundJobStatus,
  CheckInFrequency,
  CommitmentType,
  NotificationCategory,
  NotificationDeliveryStatus,
  ScheduleChangeReason,
  TaskStatus,
} from "@prisma/client";
import { Temporal } from "temporal-polyfill";
import { prisma } from "@/lib/db/prisma";
import {
  formatTimeInZone,
  getLocalDayBoundsUtc,
  getLocalWallClockInfo,
  resolveLocalDateTimeToUtc,
} from "@/lib/time/timezone";
import { getPublicVapidKey, sendPushToUserDevices } from "@/lib/push/web-push";
import { getNowOverviewData } from "@/modules/now/now-service";
import {
  confirmTaskCompletion,
  markTaskStarted,
  rescheduleOrChangeCommitment,
} from "@/modules/tasks/task-service";
import { logExplicitActivityCheckIn } from "@/modules/activity/activity-service";
import {
  evaluateNotificationDeliveryPolicy,
  evaluateTaskJobWakeupGuard,
} from "./notification-rules";

export interface CheckInOptionItem {
  value: string;
  label: string;
  tone: "primary" | "secondary" | "ghost";
}

export interface CheckInMetadataPayload {
  promptKind: "TASK" | "ACTIVITY" | "BRIEFING";
  options: CheckInOptionItem[];
  taskTitle?: string;
  lifeAreaName?: string;
  lifeAreaColor?: string;
  scheduledWindowLabel?: string;
  briefingHighlights?: string[];
}

function makeNotificationId(): string {
  return `chk_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

export async function getOrCreateUserPreferences(userId: string) {
  return prisma.userPreference.upsert({
    where: { userId },
    update: {},
    create: {
      userId,
      ianaTimeZone: "Africa/Lagos",
      morningBriefingEnabled: true,
      morningBriefingTime: "07:30",
      declaredWakeTime: "07:00",
      declaredSleepTime: "23:00",
      quietHoursEnabled: true,
      quietHoursStart: "22:00",
      quietHoursEnd: "07:00",
      maxDailyCheckIns: 6,
      defaultPreTaskReminderMin: 30,
      randomCheckInsEnabled: true,
      checkInFrequency: CheckInFrequency.BALANCED,
      minMinutesBetweenCheckIns: 120,
    },
  });
}

export async function updateUserPreferences(
  userId: string,
  input: {
    ianaTimeZone: string;
    morningBriefingEnabled: boolean;
    morningBriefingTime: string;
    declaredWakeTime: string;
    declaredSleepTime: string;
    quietHoursEnabled: boolean;
    quietHoursStart: string;
    quietHoursEnd: string;
    maxDailyCheckIns: number;
    defaultPreTaskReminderMin: number;
    randomCheckInsEnabled: boolean;
    checkInFrequency: CheckInFrequency;
    minMinutesBetweenCheckIns: number;
  }
) {
  // Validate IANA timezone cleanly via Temporal before persisting
  let safeZone = input.ianaTimeZone.trim() || "Africa/Lagos";
  try {
    Temporal.Now.zonedDateTimeISO(safeZone);
  } catch {
    safeZone = "UTC";
  }

  return prisma.userPreference.upsert({
    where: { userId },
    update: {
      ianaTimeZone: safeZone,
      morningBriefingEnabled: input.morningBriefingEnabled,
      morningBriefingTime: input.morningBriefingTime,
      declaredWakeTime: input.declaredWakeTime,
      declaredSleepTime: input.declaredSleepTime,
      quietHoursEnabled: input.quietHoursEnabled,
      quietHoursStart: input.quietHoursStart,
      quietHoursEnd: input.quietHoursEnd,
      maxDailyCheckIns: Math.max(1, Math.min(20, input.maxDailyCheckIns)),
      defaultPreTaskReminderMin: Math.max(
        5,
        Math.min(180, input.defaultPreTaskReminderMin)
      ),
      randomCheckInsEnabled: input.randomCheckInsEnabled,
      checkInFrequency: input.checkInFrequency,
      minMinutesBetweenCheckIns: Math.max(
        30,
        Math.min(720, input.minMinutesBetweenCheckIns)
      ),
    },
    create: {
      userId,
      ianaTimeZone: safeZone,
      morningBriefingEnabled: input.morningBriefingEnabled,
      morningBriefingTime: input.morningBriefingTime,
      declaredWakeTime: input.declaredWakeTime,
      declaredSleepTime: input.declaredSleepTime,
      quietHoursEnabled: input.quietHoursEnabled,
      quietHoursStart: input.quietHoursStart,
      quietHoursEnd: input.quietHoursEnd,
      maxDailyCheckIns: Math.max(1, Math.min(20, input.maxDailyCheckIns)),
      defaultPreTaskReminderMin: Math.max(
        5,
        Math.min(180, input.defaultPreTaskReminderMin)
      ),
      randomCheckInsEnabled: input.randomCheckInsEnabled,
      checkInFrequency: input.checkInFrequency,
      minMinutesBetweenCheckIns: Math.max(
        30,
        Math.min(720, input.minMinutesBetweenCheckIns)
      ),
    },
  });
}

async function getDailyDeliveryContext(
  userId: string,
  ianaTimeZone: string,
  nowUtc: Date
) {
  const wall = getLocalWallClockInfo(nowUtc, ianaTimeZone);
  const bounds = getLocalDayBoundsUtc(wall.localDate, ianaTimeZone);

  const [deliveredTodayCount, latestDelivered] = await Promise.all([
    prisma.notification.count({
      where: {
        userId,
        deliveredAt: { gte: bounds.startUtc, lt: bounds.endUtc },
        status: {
          in: [
            NotificationDeliveryStatus.DELIVERED,
            NotificationDeliveryStatus.READ,
            NotificationDeliveryStatus.RESPONDED,
          ],
        },
      },
    }),
    prisma.notification.findFirst({
      where: {
        userId,
        deliveredAt: { not: null },
      },
      orderBy: { deliveredAt: "desc" },
      select: { deliveredAt: true },
    }),
  ]);

  return {
    localDate: wall.localDate,
    localTimeHHmm: wall.localTimeHHmm,
    deliveredTodayCount,
    lastDeliveredAtUtc: latestDelivered?.deliveredAt ?? null,
  };
}

/**
 * Executes a single scheduled BackgroundJob with authoritative PostgreSQL
 * version checking, quiet-hours awareness, and Web Push dispatch.
 */
export async function deliverTaskBackgroundJob(
  jobId: string,
  nowUtc = new Date()
): Promise<{ delivered: boolean; notificationId?: string; reason?: string }> {
  const job = await prisma.backgroundJob.findUnique({
    where: { id: jobId },
    include: {
      task: {
        include: { lifeArea: true },
      },
    },
  });

  if (!job) {
    return { delivered: false, reason: "JOB_NOT_FOUND" };
  }

  const guard = evaluateTaskJobWakeupGuard(job, job.task);
  if (!guard.shouldDeliver || !job.task) {
    if (job.status === BackgroundJobStatus.SCHEDULED) {
      await prisma.backgroundJob.update({
        where: { id: job.id },
        data: {
          status: guard.nextJobStatus,
          executedAt: nowUtc,
          cancelReason: guard.reason ?? null,
        },
      });
    }
    return { delivered: false, reason: guard.reason };
  }

  const task = job.task;
  const pref = await getOrCreateUserPreferences(job.userId);
  const deliveryCtx = await getDailyDeliveryContext(
    job.userId,
    pref.ianaTimeZone,
    nowUtc
  );

  // Core Principle #4: When end-of-window arrives, never mark COMPLETED; move to NEEDS_CHECKIN.
  if (
    job.kind === BackgroundJobKind.TASK_END_CONFIRMATION &&
    (task.status === TaskStatus.ACTIVE || task.status === TaskStatus.IN_PROGRESS)
  ) {
    await prisma.task.update({
      where: { id: task.id },
      data: { status: TaskStatus.NEEDS_CHECKIN },
    });
  }

  const windowLabel =
    task.scheduledStart && task.scheduledEnd
      ? `${formatTimeInZone(task.scheduledStart, pref.ianaTimeZone)} to ${formatTimeInZone(
          task.scheduledEnd,
          pref.ianaTimeZone
        )}`
      : undefined;

  let category: NotificationCategory =
    NotificationCategory.PRE_COMMITMENT_CHECKIN;
  let title = `Coming up: ${task.title}`;
  let body = windowLabel
    ? `${task.lifeArea.name} (${windowLabel})`
    : task.lifeArea.name;
  let options: CheckInOptionItem[] = [
    { value: "READY", label: "Ready", tone: "primary" },
    { value: "TOMORROW_MORNING", label: "Move to tomorrow", tone: "secondary" },
    { value: "MAKE_FLEXIBLE", label: "Make flexible", tone: "ghost" },
  ];

  if (job.kind === BackgroundJobKind.TASK_START_CONFIRMATION) {
    category = NotificationCategory.START_CONFIRMATION;
    title = `Time for ${task.title}`;
    body = windowLabel
      ? `Scheduled for ${windowLabel}`
      : `Under ${task.lifeArea.name}`;
    options = [
      { value: "STARTED", label: "Started", tone: "primary" },
      { value: "SNOOZE_15M", label: "In 15 min", tone: "secondary" },
      { value: "MAKE_FLEXIBLE", label: "Make flexible", tone: "ghost" },
    ];
  } else if (job.kind === BackgroundJobKind.TASK_END_CONFIRMATION) {
    category = NotificationCategory.END_CONFIRMATION;
    title = `How did ${task.title} go?`;
    body = "Scheduled window ended. Orbit kept it open until you confirm.";
    options = [
      { value: "COMPLETED", label: "Completed", tone: "primary" },
      { value: "STILL_WORKING_30M", label: "+30 min", tone: "secondary" },
      { value: "TOMORROW_MORNING", label: "Tomorrow morning", tone: "secondary" },
      { value: "MAKE_FLEXIBLE", label: "Make flexible", tone: "ghost" },
    ];
  }

  const policy = evaluateNotificationDeliveryPolicy({
    category,
    nowUtc,
    preferences: pref,
    deliveredTodayCount: deliveryCtx.deliveredTodayCount,
    lastDeliveredAtUtc: deliveryCtx.lastDeliveredAtUtc,
  });

  const metadata: CheckInMetadataPayload = {
    promptKind: "TASK",
    options,
    taskTitle: task.title,
    lifeAreaName: task.lifeArea.name,
    lifeAreaColor: task.lifeArea.colorToken,
    scheduledWindowLabel: windowLabel,
  };

  const notifId = makeNotificationId();
  const status = policy.allowDelivery
    ? NotificationDeliveryStatus.DELIVERED
    : policy.suppressedByQuietHours
      ? NotificationDeliveryStatus.SUPPRESSED_QUIET_HOURS
      : NotificationDeliveryStatus.DISMISSED;

  const notification = await prisma.$transaction(async (tx) => {
    const existing = await tx.notification.findUnique({
      where: { idempotencyKey: job.idempotencyKey },
    });
    if (existing) {
      await tx.backgroundJob.update({
        where: { id: job.id },
        data: {
          status: BackgroundJobStatus.COMPLETED,
          executedAt: nowUtc,
        },
      });
      return existing;
    }

    const created = await tx.notification.create({
      data: {
        id: notifId,
        userId: job.userId,
        taskId: task.id,
        backgroundJobId: job.id,
        category,
        title,
        body,
        actionUrl: `/check-in/${notifId}`,
        metadata: metadata as unknown as object,
        idempotencyKey: job.idempotencyKey,
        status,
        scheduledFor: job.scheduledFor,
        deliveredAt: policy.allowDelivery ? nowUtc : null,
      },
    });

    await tx.backgroundJob.update({
      where: { id: job.id },
      data: {
        status: BackgroundJobStatus.COMPLETED,
        executedAt: nowUtc,
      },
    });

    return created;
  });

  if (policy.allowDelivery) {
    await sendPushToUserDevices(job.userId, {
      title: notification.title,
      body: notification.body,
      actionUrl: notification.actionUrl,
      tag: notification.idempotencyKey,
    });
  }

  return {
    delivered: policy.allowDelivery,
    notificationId: notification.id,
    reason: policy.reason,
  };
}

/**
 * Sweeps due SCHEDULED BackgroundJob rows (used by both Inngest cron and local dev).
 */
export async function evaluateDueBackgroundJobs(options?: {
  userId?: string;
  nowUtc?: Date;
  limit?: number;
}) {
  const now = options?.nowUtc ?? new Date();
  const dueJobs = await prisma.backgroundJob.findMany({
    where: {
      status: BackgroundJobStatus.SCHEDULED,
      scheduledFor: { lte: now },
      ...(options?.userId ? { userId: options.userId } : {}),
    },
    orderBy: { scheduledFor: "asc" },
    take: options?.limit ?? 25,
  });

  let delivered = 0;
  for (const job of dueJobs) {
    const res = await deliverTaskBackgroundJob(job.id, now);
    if (res.delivered) delivered += 1;
  }

  return { processed: dueJobs.length, delivered };
}

/**
 * Generates a concise, timezone-aware Morning Briefing notification.
 */
export async function generateMorningBriefingForUser(
  userId: string,
  nowUtc = new Date(),
  options?: { force?: boolean }
) {
  const pref = await getOrCreateUserPreferences(userId);
  if (!pref.morningBriefingEnabled && !options?.force) {
    return { created: false, reason: "MORNING_BRIEFING_DISABLED" };
  }

  const deliveryCtx = await getDailyDeliveryContext(
    userId,
    pref.ianaTimeZone,
    nowUtc
  );

  if (!options?.force && deliveryCtx.localTimeHHmm < pref.morningBriefingTime) {
    return { created: false, reason: "BEFORE_BRIEFING_TIME" };
  }

  const idempotencyKey = options?.force
    ? `briefing:${userId}:${deliveryCtx.localDate}:manual:${nowUtc.getTime()}`
    : `briefing:${userId}:${deliveryCtx.localDate}`;

  const existing = await prisma.notification.findUnique({
    where: { idempotencyKey },
  });
  if (existing) {
    return { created: false, notification: existing, reason: "ALREADY_SENT" };
  }

  const policy = evaluateNotificationDeliveryPolicy({
    category: NotificationCategory.MORNING_BRIEFING,
    nowUtc,
    preferences: pref,
    deliveredTodayCount: deliveryCtx.deliveredTodayCount,
    lastDeliveredAtUtc: deliveryCtx.lastDeliveredAtUtc,
    forceBypassLimits: options?.force,
  });

  if (!policy.allowDelivery) {
    return { created: false, reason: policy.reason ?? "SUPPRESSED" };
  }

  const overview = await getNowOverviewData(userId, nowUtc);
  const highlights: string[] = [];

  if (overview.activeLocationRoutine) {
    const loc =
      overview.activeLocationRoutine.physicalLocation ??
      overview.activeLocationRoutine.title;
    highlights.push(
      `${loc} (${overview.activeLocationRoutine.startTimeLocal} to ${overview.activeLocationRoutine.endTimeLocal})`
    );
  }
  if (overview.scheduledToday.length > 0) {
    highlights.push(
      `${overview.scheduledToday.length} scheduled ${
        overview.scheduledToday.length === 1 ? "commitment" : "commitments"
      } today`
    );
  } else {
    highlights.push("Open calendar today");
  }
  if (overview.needsCheckInTasks.length > 0) {
    highlights.push(
      `${overview.needsCheckInTasks.length} earlier ${
        overview.needsCheckInTasks.length === 1 ? "item needs" : "items need"
      } a quick check-in`
    );
  }
  if (overview.flexibleTasks[0]) {
    highlights.push(`Top flexible pick: ${overview.flexibleTasks[0].title}`);
  }

  const body = highlights.slice(0, 2).join(" · ");
  const notifId = makeNotificationId();
  const metadata: CheckInMetadataPayload = {
    promptKind: "BRIEFING",
    briefingHighlights: highlights,
    options: [
      { value: "ACKNOWLEDGE", label: "Looks good", tone: "primary" },
    ],
  };

  const notification = await prisma.notification.create({
    data: {
      id: notifId,
      userId,
      category: NotificationCategory.MORNING_BRIEFING,
      title: "Morning briefing",
      body,
      actionUrl: `/check-in/${notifId}`,
      metadata: metadata as unknown as object,
      idempotencyKey,
      status: NotificationDeliveryStatus.DELIVERED,
      scheduledFor: nowUtc,
      deliveredAt: nowUtc,
    },
  });

  await sendPushToUserDevices(userId, {
    title: notification.title,
    body: notification.body,
    actionUrl: notification.actionUrl,
    tag: `briefing-${deliveryCtx.localDate}`,
  });

  return { created: true, notification };
}

/**
 * Generates a low-friction activity check-in ("What are you working on right now?")
 * bounded by quiet hours, waking window, and cooldown spacing.
 */
export async function generateRandomActivityCheckIn(
  userId: string,
  nowUtc = new Date(),
  options?: { force?: boolean }
) {
  const pref = await getOrCreateUserPreferences(userId);
  const deliveryCtx = await getDailyDeliveryContext(
    userId,
    pref.ianaTimeZone,
    nowUtc
  );

  const policy = evaluateNotificationDeliveryPolicy({
    category: NotificationCategory.RANDOM_CHECKIN,
    nowUtc,
    preferences: pref,
    deliveredTodayCount: deliveryCtx.deliveredTodayCount,
    lastDeliveredAtUtc: deliveryCtx.lastDeliveredAtUtc,
    forceBypassLimits: options?.force,
  });

  if (!policy.allowDelivery) {
    return { created: false, reason: policy.reason ?? "SUPPRESSED" };
  }

  const hourSlot = deliveryCtx.localTimeHHmm.slice(0, 2);
  const idempotencyKey = options?.force
    ? `random:${userId}:${deliveryCtx.localDate}:manual:${nowUtc.getTime()}`
    : `random:${userId}:${deliveryCtx.localDate}:h${hourSlot}`;

  const existing = await prisma.notification.findUnique({
    where: { idempotencyKey },
  });
  if (existing) {
    return { created: false, notification: existing, reason: "ALREADY_SENT" };
  }

  const notifId = makeNotificationId();
  const metadata: CheckInMetadataPayload = {
    promptKind: "ACTIVITY",
    options: [
      { value: "LOG_WORK", label: "Log work", tone: "primary" },
      { value: "DISMISS", label: "Skip for now", tone: "ghost" },
    ],
  };

  const notification = await prisma.notification.create({
    data: {
      id: notifId,
      userId,
      category: NotificationCategory.RANDOM_CHECKIN,
      title: "Quick check-in",
      body: "What are you working on right now?",
      actionUrl: `/check-in/${notifId}`,
      metadata: metadata as unknown as object,
      idempotencyKey,
      status: NotificationDeliveryStatus.DELIVERED,
      scheduledFor: nowUtc,
      deliveredAt: nowUtc,
    },
  });

  await sendPushToUserDevices(userId, {
    title: notification.title,
    body: notification.body,
    actionUrl: notification.actionUrl,
    tag: "orbit-activity-checkin",
  });

  return { created: true, notification };
}

/**
 * Triggers a task check-in notification on demand (for example from `/settings` test controls
 * or for an elapsed scheduled commitment).
 */
export async function generateTaskCheckInSample(
  userId: string,
  nowUtc = new Date()
) {
  const pref = await getOrCreateUserPreferences(userId);
  const candidateTask =
    (await prisma.task.findFirst({
      where: {
        userId,
        status: {
          in: [
            TaskStatus.NEEDS_CHECKIN,
            TaskStatus.IN_PROGRESS,
            TaskStatus.ACTIVE,
          ],
        },
      },
      include: { lifeArea: true },
      orderBy: [{ commitmentType: "asc" }, { updatedAt: "desc" }],
    })) ?? null;

  if (!candidateTask) {
    return generateRandomActivityCheckIn(userId, nowUtc, { force: true });
  }

  const windowLabel =
    candidateTask.scheduledStart && candidateTask.scheduledEnd
      ? `${formatTimeInZone(
          candidateTask.scheduledStart,
          pref.ianaTimeZone
        )} to ${formatTimeInZone(candidateTask.scheduledEnd, pref.ianaTimeZone)}`
      : undefined;

  const notifId = makeNotificationId();
  const metadata: CheckInMetadataPayload = {
    promptKind: "TASK",
    taskTitle: candidateTask.title,
    lifeAreaName: candidateTask.lifeArea.name,
    lifeAreaColor: candidateTask.lifeArea.colorToken,
    scheduledWindowLabel: windowLabel,
    options: [
      { value: "COMPLETED", label: "Completed", tone: "primary" },
      { value: "STILL_WORKING_30M", label: "+30 min", tone: "secondary" },
      { value: "TOMORROW_MORNING", label: "Tomorrow morning", tone: "secondary" },
      { value: "MAKE_FLEXIBLE", label: "Make flexible", tone: "ghost" },
    ],
  };

  const notification = await prisma.notification.create({
    data: {
      id: notifId,
      userId,
      taskId: candidateTask.id,
      category: NotificationCategory.END_CONFIRMATION,
      title: `How did ${candidateTask.title} go?`,
      body: `Quick check-in under ${candidateTask.lifeArea.name}.`,
      actionUrl: `/check-in/${notifId}`,
      metadata: metadata as unknown as object,
      idempotencyKey: `task-sample:${userId}:${candidateTask.id}:${nowUtc.getTime()}`,
      status: NotificationDeliveryStatus.DELIVERED,
      scheduledFor: nowUtc,
      deliveredAt: nowUtc,
    },
  });

  await sendPushToUserDevices(userId, {
    title: notification.title,
    body: notification.body,
    actionUrl: notification.actionUrl,
    tag: `task-checkin-${candidateTask.id}`,
  });

  return { created: true, notification };
}

/**
 * Processes a user's 1-tap or short-note response from `/check-in/[id]` or in-app controls.
 */
export async function respondToNotification(
  userId: string,
  notificationId: string,
  input: {
    responseValue: string;
    responseNote?: string | null;
    lifeAreaId?: string | null;
    durationMinutes?: number;
  }
) {
  const notification = await prisma.notification.findFirst({
    where: { id: notificationId, userId },
    include: { task: true },
  });
  if (!notification) {
    throw new Error("Check-in not found.");
  }

  const now = new Date();
  const choice = input.responseValue.trim().toUpperCase();
  const note = input.responseNote?.trim() || null;

  if (choice === "DISMISS") {
    return prisma.notification.update({
      where: { id: notification.id },
      data: {
        status: NotificationDeliveryStatus.DISMISSED,
        responseValue: "DISMISS",
        responseNote: note,
        dismissedAt: now,
      },
    });
  }

  if (choice === "LOG_WORK") {
    const title = note || "Focused session";
    await logExplicitActivityCheckIn(userId, {
      title,
      lifeAreaId: input.lifeAreaId || null,
      durationMinutes: input.durationMinutes ?? 45,
    });
  } else if (notification.taskId && notification.task) {
    const task = notification.task;
    if (choice === "COMPLETED") {
      await confirmTaskCompletion(userId, task.id);
    } else if (choice === "STARTED") {
      await markTaskStarted(userId, task.id);
    } else if (choice === "STILL_WORKING_30M") {
      const newStart = task.scheduledStart ?? now;
      const newEnd = new Date(now.getTime() + 30 * 60 * 1000);
      await rescheduleOrChangeCommitment(userId, task.id, {
        newCommitmentType: CommitmentType.SCHEDULED,
        newStart,
        newEnd,
        reason: ScheduleChangeReason.USER_RESCHEDULED,
        note: note ?? "Extended by 30 minutes from check-in",
      });
    } else if (choice === "SNOOZE_15M") {
      const newStart = new Date(now.getTime() + 15 * 60 * 1000);
      const dur = task.estimatedMinutes ?? 45;
      const newEnd = new Date(newStart.getTime() + dur * 60 * 1000);
      await rescheduleOrChangeCommitment(userId, task.id, {
        newCommitmentType: CommitmentType.SCHEDULED,
        newStart,
        newEnd,
        reason: ScheduleChangeReason.USER_RESCHEDULED,
        note: note ?? "Shifted 15 minutes from check-in",
      });
    } else if (choice === "TOMORROW_MORNING") {
      const pref = await getOrCreateUserPreferences(userId);
      const tomorrowLocal = Temporal.Instant.fromEpochMilliseconds(now.getTime())
        .toZonedDateTimeISO(pref.ianaTimeZone)
        .toPlainDate()
        .add({ days: 1 })
        .toString();
      const resolved = resolveLocalDateTimeToUtc(
        tomorrowLocal,
        "09:30",
        pref.ianaTimeZone
      );
      const dur = task.estimatedMinutes ?? 60;
      const newEnd = new Date(
        resolved.instantUtc.getTime() + dur * 60 * 1000
      );
      await rescheduleOrChangeCommitment(userId, task.id, {
        newCommitmentType: CommitmentType.SCHEDULED,
        newStart: resolved.instantUtc,
        newEnd,
        reason: ScheduleChangeReason.USER_RESCHEDULED,
        note: note ?? "Moved to tomorrow morning from check-in",
      });
    } else if (choice === "MAKE_FLEXIBLE") {
      await rescheduleOrChangeCommitment(userId, task.id, {
        newCommitmentType: CommitmentType.FLEXIBLE,
        flexibilityWindow: "THIS_WEEK",
        reason: ScheduleChangeReason.MOVED_TO_FLEXIBLE,
        note: note ?? "Returned to flexible pool from check-in",
      });
    }
  }

  return prisma.notification.update({
    where: { id: notification.id },
    data: {
      status: NotificationDeliveryStatus.RESPONDED,
      responseValue: choice,
      responseNote: note,
      respondedAt: now,
    },
  });
}

export async function registerUserPushSubscription(
  userId: string,
  input: {
    endpoint: string;
    p256dhKey: string;
    authKey: string;
    userAgent?: string | null;
    deviceName?: string | null;
  }
) {
  return prisma.pushSubscription.upsert({
    where: { endpoint: input.endpoint },
    update: {
      userId,
      p256dhKey: input.p256dhKey,
      authKey: input.authKey,
      userAgent: input.userAgent ?? null,
      deviceName: input.deviceName ?? "Browser",
      isActive: true,
      lastUsedAt: new Date(),
    },
    create: {
      userId,
      endpoint: input.endpoint,
      p256dhKey: input.p256dhKey,
      authKey: input.authKey,
      userAgent: input.userAgent ?? null,
      deviceName: input.deviceName ?? "Browser",
      isActive: true,
      lastUsedAt: new Date(),
    },
  });
}

export async function removeUserPushSubscription(
  userId: string,
  subscriptionId: string
) {
  const existing = await prisma.pushSubscription.findFirst({
    where: { id: subscriptionId, userId },
  });
  if (!existing) return;

  await prisma.pushSubscription.delete({
    where: { id: existing.id },
  });
}

export async function getNotificationsAndSettingsData(userId: string) {
  // Also evaluate any due local scheduled jobs on read so standalone dev stays fresh
  await evaluateDueBackgroundJobs({ userId, limit: 15 });

  const [preferences, notifications, pushSubscriptions, lifeAreas, projects] =
    await Promise.all([
      getOrCreateUserPreferences(userId),
      prisma.notification.findMany({
        where: {
          userId,
          status: {
            in: [
              NotificationDeliveryStatus.DELIVERED,
              NotificationDeliveryStatus.READ,
              NotificationDeliveryStatus.RESPONDED,
              NotificationDeliveryStatus.SUPPRESSED_QUIET_HOURS,
            ],
          },
        },
        include: {
          task: {
            include: { lifeArea: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 25,
      }),
      prisma.pushSubscription.findMany({
        where: { userId, isActive: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.lifeArea.findMany({
        where: { userId, isArchived: false },
        orderBy: { sortOrder: "asc" },
      }),
      prisma.project.findMany({
        where: { userId, status: "ACTIVE" },
        orderBy: { sortOrder: "asc" },
      }),
    ]);

  return {
    preferences,
    notifications,
    pushSubscriptions,
    vapidPublicKey: getPublicVapidKey(),
    lifeAreas,
    projects,
  };
}
