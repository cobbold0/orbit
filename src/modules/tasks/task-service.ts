import {
  ActivitySource,
  CommitmentType,
  ScheduleChangeReason,
  TaskPriority,
  TaskStatus,
} from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { computeTaskScheduleTransition } from "./task-rules";
import { parseQuickCaptureInput } from "./quick-capture-parser";
import {
  flushPendingOutboxEvents,
  syncTaskWorkflowJobsTx,
} from "@/modules/outbox/outbox-service";

export async function createTaskWithQuickCapture(
  userId: string,
  rawInput: string,
  overrideLifeAreaId?: string
) {
  const [pref, lifeAreas] = await Promise.all([
    prisma.userPreference.findUnique({ where: { userId } }),
    prisma.lifeArea.findMany({
      where: { userId, isArchived: false },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  const ianaTimeZone = pref?.ianaTimeZone ?? "Africa/Lagos";
  const reminderMin = pref?.defaultPreTaskReminderMin ?? 30;
  const parsed = parseQuickCaptureInput(rawInput, lifeAreas, ianaTimeZone);
  let targetAreaId =
    overrideLifeAreaId && overrideLifeAreaId.length > 0
      ? overrideLifeAreaId
      : parsed.lifeAreaId || lifeAreas[0]?.id;

  // Validate that targetAreaId belongs to user
  if (!lifeAreas.some((a) => a.id === targetAreaId)) {
    targetAreaId = lifeAreas[0]?.id;
  }

  if (!targetAreaId) {
    throw new Error("At least one Life Area is required to create a task.");
  }

  const created = await prisma.$transaction(async (tx) => {
    const task = await tx.task.create({
      data: {
        userId,
        lifeAreaId: targetAreaId,
        title: parsed.title,
        commitmentType: parsed.commitmentType,
        priority: parsed.priority,
        estimatedMinutes: parsed.estimatedMinutes,
        flexibilityWindow: parsed.flexibilityWindow,
        scheduledStart: parsed.scheduledStart,
        scheduledEnd: parsed.scheduledEnd,
        dueDate: parsed.dueDate,
        waitingOnPerson: parsed.waitingOnPerson,
        waitingOnCondition: parsed.waitingOnCondition,
        waitingSince:
          parsed.commitmentType === CommitmentType.WAITING ? new Date() : null,
      },
    });

    if (
      task.commitmentType === CommitmentType.SCHEDULED &&
      task.scheduledStart &&
      task.scheduledEnd
    ) {
      await syncTaskWorkflowJobsTx(tx, {
        userId,
        taskId: task.id,
        commitmentType: task.commitmentType,
        status: task.status,
        scheduleVersion: task.scheduleVersion,
        scheduledStart: task.scheduledStart,
        scheduledEnd: task.scheduledEnd,
        preTaskReminderMinutes: reminderMin,
        eventReason: "SCHEDULED",
      });
    }

    return task;
  });

  if (created.commitmentType === CommitmentType.SCHEDULED) {
    void flushPendingOutboxEvents({ userId, limit: 5 });
  }

  return created;
}

export async function createStructuredTask(
  userId: string,
  input: {
    title: string;
    description?: string;
    lifeAreaId: string;
    projectId?: string | null;
    milestoneId?: string | null;
    commitmentType: CommitmentType;
    priority: TaskPriority;
    estimatedMinutes?: number | null;
    dueDate?: Date | null;
    scheduledStart?: Date | null;
    scheduledEnd?: Date | null;
    flexibilityWindow?: string | null;
    waitingOnPerson?: string | null;
    waitingOnCondition?: string | null;
  }
) {
  const pref = await prisma.userPreference.findUnique({ where: { userId } });
  const reminderMin = pref?.defaultPreTaskReminderMin ?? 30;

  // Validate that the life area belongs to the user
  const area = await prisma.lifeArea.findFirst({
    where: { id: input.lifeAreaId, userId },
    select: { id: true },
  });
  if (!area) {
    throw new Error("Invalid life area or unauthorized");
  }

  // Validate project if supplied
  let validProjectId: string | null = null;
  let validMilestoneId: string | null = null;
  if (input.projectId) {
    const proj = await prisma.project.findFirst({
      where: { id: input.projectId, userId, lifeAreaId: area.id },
      select: { id: true },
    });
    if (!proj) {
      throw new Error("Invalid project or unauthorized");
    }
    validProjectId = proj.id;

    if (input.milestoneId) {
      const ms = await prisma.projectMilestone.findFirst({
        where: { id: input.milestoneId, projectId: proj.id },
        select: { id: true },
      });
      if (ms) validMilestoneId = ms.id;
    }
  }

  const created = await prisma.$transaction(async (tx) => {
    const task = await tx.task.create({
      data: {
        userId,
        lifeAreaId: area.id,
        projectId: validProjectId,
        milestoneId: validMilestoneId,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        commitmentType: input.commitmentType,
        priority: input.priority,
        estimatedMinutes: input.estimatedMinutes ?? null,
        dueDate: input.dueDate ?? null,
        scheduledStart:
          input.commitmentType === CommitmentType.SCHEDULED
            ? (input.scheduledStart ?? null)
            : null,
        scheduledEnd:
          input.commitmentType === CommitmentType.SCHEDULED
            ? (input.scheduledEnd ?? null)
            : null,
        flexibilityWindow:
          input.commitmentType === CommitmentType.FLEXIBLE
            ? (input.flexibilityWindow ?? "THIS_WEEK")
            : null,
        waitingOnPerson:
          input.commitmentType === CommitmentType.WAITING
            ? (input.waitingOnPerson?.trim() || null)
            : null,
        waitingOnCondition:
          input.commitmentType === CommitmentType.WAITING
            ? (input.waitingOnCondition?.trim() || null)
            : null,
        waitingSince:
          input.commitmentType === CommitmentType.WAITING ? new Date() : null,
      },
    });

    if (
      task.commitmentType === CommitmentType.SCHEDULED &&
      task.scheduledStart &&
      task.scheduledEnd
    ) {
      await syncTaskWorkflowJobsTx(tx, {
        userId,
        taskId: task.id,
        commitmentType: task.commitmentType,
        status: task.status,
        scheduleVersion: task.scheduleVersion,
        scheduledStart: task.scheduledStart,
        scheduledEnd: task.scheduledEnd,
        preTaskReminderMinutes: reminderMin,
        eventReason: "SCHEDULED",
      });
    }

    return task;
  });

  if (created.commitmentType === CommitmentType.SCHEDULED) {
    void flushPendingOutboxEvents({ userId, limit: 5 });
  }

  return created;
}

export async function confirmTaskCompletion(
  userId: string,
  taskId: string,
  actualMinutes?: number
) {
  const task = await prisma.task.findFirst({
    where: { id: taskId, userId },
  });
  if (!task) throw new Error("Task not found");

  // Idempotency guard: if the task is already completed, return immediately.
  if (task.status === TaskStatus.COMPLETED) {
    return task;
  }

  const now = new Date();
  const durationMinutes = actualMinutes ?? task.estimatedMinutes ?? 30;
  const startedAt =
    task.startedAt ?? new Date(now.getTime() - durationMinutes * 60 * 1000);

  const completed = await prisma.$transaction(async (tx) => {
    // Re-verify task inside transaction to eliminate race conditions
    const current = await tx.task.findUnique({
      where: { id: task.id },
      select: { status: true },
    });
    if (current?.status === TaskStatus.COMPLETED) {
      return task;
    }

    const updatedTask = await tx.task.update({
      where: { id: task.id },
      data: {
        status: TaskStatus.COMPLETED,
        completedAt: now,
        scheduleVersion: { increment: 1 },
      },
    });

    // Check if an activity record for this completion already exists
    const existingRecord = await tx.activityRecord.findFirst({
      where: {
        taskId: task.id,
        source: ActivitySource.TASK_COMPLETION,
      },
    });

    if (!existingRecord) {
      await tx.activityRecord.create({
        data: {
          userId,
          lifeAreaId: task.lifeAreaId,
          projectId: task.projectId,
          milestoneId: task.milestoneId,
          taskId: task.id,
          title: `Completed: ${task.title}`,
          startedAt,
          endedAt: now,
          durationMinutes,
          source: ActivitySource.TASK_COMPLETION,
          isConfirmed: true,
        },
      });
    }

    await syncTaskWorkflowJobsTx(tx, {
      userId,
      taskId: updatedTask.id,
      commitmentType: updatedTask.commitmentType,
      status: updatedTask.status,
      scheduleVersion: updatedTask.scheduleVersion,
      scheduledStart: updatedTask.scheduledStart,
      scheduledEnd: updatedTask.scheduledEnd,
      preTaskReminderMinutes: 30,
      eventReason: "COMPLETED",
      nowUtc: now,
    });

    return updatedTask;
  });

  void flushPendingOutboxEvents({ userId, limit: 5 });
  return completed;
}

export async function markTaskStarted(userId: string, taskId: string) {
  const task = await prisma.task.findFirst({
    where: { id: taskId, userId },
  });
  if (!task) throw new Error("Task not found");

  return prisma.task.update({
    where: { id: task.id },
    data: {
      status: TaskStatus.IN_PROGRESS,
      startedAt: new Date(),
    },
  });
}

export async function rescheduleOrChangeCommitment(
  userId: string,
  taskId: string,
  input: {
    newCommitmentType: CommitmentType;
    newStart?: Date | null;
    newEnd?: Date | null;
    flexibilityWindow?: string | null;
    waitingOnPerson?: string | null;
    waitingOnCondition?: string | null;
    reason: ScheduleChangeReason;
    note?: string;
  }
) {
  const [task, pref] = await Promise.all([
    prisma.task.findFirst({ where: { id: taskId, userId } }),
    prisma.userPreference.findUnique({ where: { userId } }),
  ]);
  if (!task) throw new Error("Task not found");

  const reminderMin = pref?.defaultPreTaskReminderMin ?? 30;

  const transition = computeTaskScheduleTransition(
    {
      id: task.id,
      commitmentType: task.commitmentType,
      status: task.status,
      scheduledStart: task.scheduledStart,
      scheduledEnd: task.scheduledEnd,
      scheduleVersion: task.scheduleVersion,
      postponeCount: task.postponeCount,
    },
    {
      newCommitmentType: input.newCommitmentType,
      newStart: input.newStart,
      newEnd: input.newEnd,
      reason: input.reason,
      note: input.note,
    }
  );

  const updated = await prisma.$transaction(async (tx) => {
    const nextTask = await tx.task.update({
      where: { id: task.id },
      data: {
        ...transition.nextTaskState,
        flexibilityWindow:
          input.newCommitmentType === CommitmentType.FLEXIBLE
            ? (input.flexibilityWindow ?? task.flexibilityWindow ?? "THIS_WEEK")
            : null,
        waitingOnPerson:
          input.newCommitmentType === CommitmentType.WAITING
            ? (input.waitingOnPerson ?? task.waitingOnPerson)
            : null,
        waitingOnCondition:
          input.newCommitmentType === CommitmentType.WAITING
            ? (input.waitingOnCondition ?? task.waitingOnCondition)
            : null,
        waitingSince:
          input.newCommitmentType === CommitmentType.WAITING
            ? new Date()
            : null,
      },
    });

    await tx.taskScheduleHistory.create({
      data: {
        taskId: task.id,
        ...transition.historyEntry,
      },
    });

    await syncTaskWorkflowJobsTx(tx, {
      userId,
      taskId: nextTask.id,
      commitmentType: nextTask.commitmentType,
      status: nextTask.status,
      scheduleVersion: nextTask.scheduleVersion,
      scheduledStart: nextTask.scheduledStart,
      scheduledEnd: nextTask.scheduledEnd,
      preTaskReminderMinutes: reminderMin,
      eventReason: "RESCHEDULED",
    });

    return nextTask;
  });

  void flushPendingOutboxEvents({ userId, limit: 5 });
  return updated;
}

export async function updateTask(
  userId: string,
  taskId: string,
  input: {
    title?: string;
    lifeAreaId?: string;
    projectId?: string | null;
    milestoneId?: string | null;
    estimatedMinutes?: number | null;
    dueDate?: Date | null;
    priority?: TaskPriority;
    notes?: string | null;
    commitmentType?: CommitmentType;
    status?: TaskStatus;
  }
) {
  const task = await prisma.task.findFirst({
    where: { id: taskId, userId },
  });
  if (!task) throw new Error("Task not found");

  let validAreaId: string | undefined = undefined;
  if (input.lifeAreaId) {
    const area = await prisma.lifeArea.findFirst({
      where: { id: input.lifeAreaId, userId },
      select: { id: true },
    });
    if (area) validAreaId = area.id;
  }

  let validProjectId: string | null | undefined = undefined;
  if (input.projectId !== undefined) {
    if (input.projectId) {
      const proj = await prisma.project.findFirst({
        where: { id: input.projectId, userId },
        select: { id: true },
      });
      validProjectId = proj ? proj.id : null;
    } else {
      validProjectId = null;
    }
  }

  return prisma.task.update({
    where: { id: taskId },
    data: {
      ...(input.title ? { title: input.title.trim() } : {}),
      ...(validAreaId ? { lifeAreaId: validAreaId } : {}),
      ...(validProjectId !== undefined ? { projectId: validProjectId } : {}),
      ...(input.milestoneId !== undefined
        ? { milestoneId: input.milestoneId }
        : {}),
      ...(input.estimatedMinutes !== undefined
        ? { estimatedMinutes: input.estimatedMinutes }
        : {}),
      ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
      ...(input.priority ? { priority: input.priority } : {}),
      ...(input.notes !== undefined
        ? { contextNotes: input.notes?.trim() || null }
        : {}),
      ...(input.commitmentType ? { commitmentType: input.commitmentType } : {}),
      ...(input.status ? { status: input.status } : {}),
    },
  });
}

export async function deleteTask(userId: string, taskId: string) {
  const task = await prisma.task.findFirst({
    where: { id: taskId, userId },
  });
  if (!task) throw new Error("Task not found");

  // Clean up any references in relations before deleting task
  await prisma.backgroundJob.deleteMany({
    where: { taskId },
  });
  await prisma.notification.deleteMany({
    where: { taskId },
  });
  await prisma.taskScheduleHistory.deleteMany({
    where: { taskId },
  });
  await prisma.taskDependency.deleteMany({
    where: {
      OR: [{ dependentTaskId: taskId }, { prerequisiteTaskId: taskId }],
    },
  });
  await prisma.extractedAction.updateMany({
    where: { materializedTaskId: taskId },
    data: { materializedTaskId: null },
  });
  await prisma.activityRecord.updateMany({
    where: { taskId },
    data: { taskId: null },
  });

  return prisma.task.delete({
    where: { id: taskId },
  });
}
