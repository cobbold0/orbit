import {
  BackgroundJobKind,
  BackgroundJobStatus,
  CommitmentType,
  NotificationDeliveryStatus,
  OutboxStatus,
  Prisma,
  TaskStatus,
} from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { inngest } from "@/lib/inngest/client";

export interface TaskReminderDescriptor {
  kind: BackgroundJobKind;
  scheduledFor: Date;
  idempotencyKey: string;
}

/**
 * Computes deterministic reminder and confirmation jobs for a SCHEDULED task
 * at a specific `scheduleVersion`.
 */
export function buildTaskReminderPlan(input: {
  taskId: string;
  scheduleVersion: number;
  scheduledStart: Date;
  scheduledEnd: Date;
  preTaskReminderMinutes: number;
  nowUtc?: Date;
}): TaskReminderDescriptor[] {
  const now = input.nowUtc ?? new Date();
  const jobs: TaskReminderDescriptor[] = [];

  const preMs = Math.max(5, input.preTaskReminderMinutes) * 60 * 1000;
  const preReminderAt = new Date(input.scheduledStart.getTime() - preMs);

  if (preReminderAt.getTime() > now.getTime()) {
    jobs.push({
      kind: BackgroundJobKind.PRE_TASK_REMINDER,
      scheduledFor: preReminderAt,
      idempotencyKey: `task:${input.taskId}:v${input.scheduleVersion}:PRE_TASK_REMINDER`,
    });
  }

  if (input.scheduledStart.getTime() >= now.getTime() - 60 * 1000) {
    jobs.push({
      kind: BackgroundJobKind.TASK_START_CONFIRMATION,
      scheduledFor: input.scheduledStart,
      idempotencyKey: `task:${input.taskId}:v${input.scheduleVersion}:TASK_START_CONFIRMATION`,
    });
  }

  jobs.push({
    kind: BackgroundJobKind.TASK_END_CONFIRMATION,
    scheduledFor: input.scheduledEnd,
    idempotencyKey: `task:${input.taskId}:v${input.scheduleVersion}:TASK_END_CONFIRMATION`,
  });

  return jobs;
}

/**
 * Runs inside an active Prisma transaction whenever a task is created,
 * rescheduled, moved to FLEXIBLE/WAITING, or completed:
 * 1. Marks prior SCHEDULED BackgroundJob rows as SUPERSEDED.
 * 2. Dismisses stale PENDING notifications for the superseded schedule.
 * 3. Inserts new BackgroundJob rows if the task is SCHEDULED.
 * 4. Inserts a transactional OutboxEvent for durable Inngest delivery / cancellation.
 */
export async function syncTaskWorkflowJobsTx(
  tx: Prisma.TransactionClient,
  input: {
    userId: string;
    taskId: string;
    commitmentType: CommitmentType;
    status: TaskStatus;
    scheduleVersion: number;
    scheduledStart: Date | null;
    scheduledEnd: Date | null;
    preTaskReminderMinutes: number;
    eventReason: "SCHEDULED" | "RESCHEDULED" | "COMPLETED";
    nowUtc?: Date;
  }
) {
  const now = input.nowUtc ?? new Date();

  await tx.backgroundJob.updateMany({
    where: {
      taskId: input.taskId,
      status: BackgroundJobStatus.SCHEDULED,
    },
    data: {
      status: BackgroundJobStatus.SUPERSEDED,
      cancelledAt: now,
      cancelReason: `SUPERSEDED_BY_V${input.scheduleVersion}_${input.eventReason}`,
    },
  });

  await tx.notification.updateMany({
    where: {
      taskId: input.taskId,
      status: NotificationDeliveryStatus.PENDING,
    },
    data: {
      status: NotificationDeliveryStatus.DISMISSED,
      dismissedAt: now,
    },
  });

  if (input.eventReason === "COMPLETED" || input.status === TaskStatus.COMPLETED) {
    const outboxKey = `outbox:task:${input.taskId}:v${input.scheduleVersion}:completed`;
    await tx.outboxEvent.upsert({
      where: { idempotencyKey: outboxKey },
      update: {},
      create: {
        userId: input.userId,
        eventName: "orbit/task.completed",
        idempotencyKey: outboxKey,
        payload: {
          userId: input.userId,
          taskId: input.taskId,
          scheduleVersion: input.scheduleVersion,
        },
      },
    });
    return;
  }

  // If rescheduled before scheduling a new window (or moved to FLEXIBLE/WAITING),
  // emit orbit/task.rescheduled so sleeping Inngest runs cancel cleanly.
  if (input.eventReason === "RESCHEDULED") {
    const cancelKey = `outbox:task:${input.taskId}:v${input.scheduleVersion}:rescheduled`;
    await tx.outboxEvent.upsert({
      where: { idempotencyKey: cancelKey },
      update: {},
      create: {
        userId: input.userId,
        eventName: "orbit/task.rescheduled",
        idempotencyKey: cancelKey,
        payload: {
          userId: input.userId,
          taskId: input.taskId,
          scheduleVersion: input.scheduleVersion,
        },
      },
    });
  }

  if (
    input.commitmentType === CommitmentType.SCHEDULED &&
    input.scheduledStart &&
    input.scheduledEnd
  ) {
    const descriptors = buildTaskReminderPlan({
      taskId: input.taskId,
      scheduleVersion: input.scheduleVersion,
      scheduledStart: input.scheduledStart,
      scheduledEnd: input.scheduledEnd,
      preTaskReminderMinutes: input.preTaskReminderMinutes,
      nowUtc: now,
    });

    let preReminderJobId: string | null = null;
    let startJobId = "";
    let endJobId = "";

    for (const desc of descriptors) {
      const job = await tx.backgroundJob.upsert({
        where: { idempotencyKey: desc.idempotencyKey },
        update: {
          scheduledFor: desc.scheduledFor,
          status: BackgroundJobStatus.SCHEDULED,
          taskScheduleVersion: input.scheduleVersion,
        },
        create: {
          userId: input.userId,
          taskId: input.taskId,
          kind: desc.kind,
          status: BackgroundJobStatus.SCHEDULED,
          scheduledFor: desc.scheduledFor,
          taskScheduleVersion: input.scheduleVersion,
          idempotencyKey: desc.idempotencyKey,
        },
      });

      if (desc.kind === BackgroundJobKind.PRE_TASK_REMINDER) {
        preReminderJobId = job.id;
      } else if (desc.kind === BackgroundJobKind.TASK_START_CONFIRMATION) {
        startJobId = job.id;
      } else if (desc.kind === BackgroundJobKind.TASK_END_CONFIRMATION) {
        endJobId = job.id;
      }
    }

    const scheduleKey = `outbox:task:${input.taskId}:v${input.scheduleVersion}:scheduled`;
    await tx.outboxEvent.upsert({
      where: { idempotencyKey: scheduleKey },
      update: {},
      create: {
        userId: input.userId,
        eventName: "orbit/task.scheduled",
        idempotencyKey: scheduleKey,
        payload: {
          userId: input.userId,
          taskId: input.taskId,
          scheduleVersion: input.scheduleVersion,
          scheduledStartIso: input.scheduledStart.toISOString(),
          scheduledEndIso: input.scheduledEnd.toISOString(),
          preReminderJobId,
          startJobId,
          endJobId,
        },
      },
    });
  }
}

function isInngestDispatchConfigured(): boolean {
  const key = (process.env.INNGEST_EVENT_KEY ?? "").trim();
  const baseUrl = (process.env.INNGEST_BASE_URL ?? "").trim();
  // Dispatch when a real event key or explicit local Inngest dev URL is configured
  return (key.length > 0 && key !== "local") || baseUrl.length > 0;
}

/**
 * Publishes pending OutboxEvent rows to Inngest with retry backoff.
 * Safe to invoke fire-and-forget from Server Actions as well as from cron/flush endpoints.
 */
export async function flushPendingOutboxEvents(options?: {
  userId?: string;
  limit?: number;
}): Promise<{ scanned: number; published: number; deferred: number }> {
  const now = new Date();
  const limit = options?.limit ?? 25;

  const events = await prisma.outboxEvent.findMany({
    where: {
      status: OutboxStatus.PENDING,
      nextAttemptAt: { lte: now },
      ...(options?.userId ? { userId: options.userId } : {}),
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  if (events.length === 0) {
    return { scanned: 0, published: 0, deferred: 0 };
  }

  if (!isInngestDispatchConfigured()) {
    return { scanned: events.length, published: 0, deferred: events.length };
  }

  let published = 0;
  let deferred = 0;

  for (const evt of events) {
    try {
      const response = await inngest.send({
        id: evt.idempotencyKey,
        name: evt.eventName as keyof import("@/lib/inngest/client").OrbitInngestEvents,
        data: evt.payload as never,
      });

      await prisma.outboxEvent.update({
        where: { id: evt.id },
        data: {
          status: OutboxStatus.PUBLISHED,
          publishedAt: new Date(),
          inngestEventId: response.ids?.[0] ?? null,
          attempts: { increment: 1 },
          lastError: null,
        },
      });
      published += 1;
    } catch (err) {
      deferred += 1;
      const nextAttempts = evt.attempts + 1;
      const backoffSec = Math.min(900, Math.pow(2, nextAttempts) * 15);
      await prisma.outboxEvent.update({
        where: { id: evt.id },
        data: {
          status: nextAttempts >= 8 ? OutboxStatus.FAILED : OutboxStatus.PENDING,
          attempts: nextAttempts,
          lastError: err instanceof Error ? err.message : "Dispatch failed",
          nextAttemptAt: new Date(Date.now() + backoffSec * 1000),
        },
      });
    }
  }

  return { scanned: events.length, published, deferred };
}
