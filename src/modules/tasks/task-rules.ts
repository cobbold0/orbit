import {
  CommitmentType,
  ScheduleChangeReason,
  TaskStatus,
} from "@prisma/client";

export interface TaskScheduleSnapshot {
  id: string;
  commitmentType: CommitmentType;
  status: TaskStatus;
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
  scheduleVersion: number;
  postponeCount: number;
}

export interface RescheduleInput {
  newCommitmentType: CommitmentType;
  newStart?: Date | null;
  newEnd?: Date | null;
  reason: ScheduleChangeReason;
  note?: string;
}

export interface RescheduleTransitionResult {
  nextTaskState: {
    commitmentType: CommitmentType;
    status: TaskStatus;
    scheduledStart: Date | null;
    scheduledEnd: Date | null;
    scheduleVersion: number;
    postponeCount: number;
  };
  historyEntry: {
    previousVersion: number;
    newVersion: number;
    previousCommitment: CommitmentType;
    newCommitment: CommitmentType;
    previousStart: Date | null;
    previousEnd: Date | null;
    newStart: Date | null;
    newEnd: Date | null;
    reason: ScheduleChangeReason;
    note?: string;
  };
}

/**
 * Pure domain state machine for transitioning a task's commitment or schedule.
 * Enforces core Orbit principles:
 * - Never silently mutates commitments without incrementing scheduleVersion.
 * - Moving a task to FLEXIBLE or WAITING clears calendar slots so it doesn't clutter the timeline.
 * - SCHEDULED tasks require valid start/end timestamps.
 */
export function computeTaskScheduleTransition(
  current: TaskScheduleSnapshot,
  input: RescheduleInput
): RescheduleTransitionResult {
  if (input.newCommitmentType === CommitmentType.SCHEDULED) {
    if (!input.newStart || !input.newEnd) {
      throw new Error(
        "A SCHEDULED commitment requires both newStart and newEnd timestamps."
      );
    }
    if (input.newEnd.getTime() <= input.newStart.getTime()) {
      throw new Error("scheduledEnd must be strictly after scheduledStart.");
    }
  }

  const nextVersion = current.scheduleVersion + 1;
  const isPostponed =
    input.reason === ScheduleChangeReason.USER_RESCHEDULED ||
    input.reason === ScheduleChangeReason.DID_NOT_START ||
    input.reason === ScheduleChangeReason.INTERRUPTED;

  const scheduledStart =
    input.newCommitmentType === CommitmentType.SCHEDULED
      ? (input.newStart ?? null)
      : null;
  const scheduledEnd =
    input.newCommitmentType === CommitmentType.SCHEDULED
      ? (input.newEnd ?? null)
      : null;

  // Recovering from NEEDS_CHECKIN back to ACTIVE when rescheduled or moved to flexible
  const nextStatus =
    current.status === TaskStatus.NEEDS_CHECKIN
      ? TaskStatus.ACTIVE
      : current.status;

  return {
    nextTaskState: {
      commitmentType: input.newCommitmentType,
      status: nextStatus,
      scheduledStart,
      scheduledEnd,
      scheduleVersion: nextVersion,
      postponeCount: isPostponed
        ? current.postponeCount + 1
        : current.postponeCount,
    },
    historyEntry: {
      previousVersion: current.scheduleVersion,
      newVersion: nextVersion,
      previousCommitment: current.commitmentType,
      newCommitment: input.newCommitmentType,
      previousStart: current.scheduledStart,
      previousEnd: current.scheduledEnd,
      newStart: scheduledStart,
      newEnd: scheduledEnd,
      reason: input.reason,
      note: input.note,
    },
  };
}

/**
 * Orbit Principle #4: "Never assume a task is complete because its scheduled time has passed."
 * Evaluates whether a scheduled task whose end window has passed should transition to
 * NEEDS_CHECKIN rather than COMPLETED.
 */
export function evaluateElapsedCommitmentStatus(
  task: Pick<
    TaskScheduleSnapshot,
    "commitmentType" | "status" | "scheduledEnd"
  >,
  nowUtc: Date
): TaskStatus {
  if (
    task.status === TaskStatus.COMPLETED ||
    task.status === TaskStatus.ARCHIVED
  ) {
    return task.status;
  }

  if (
    task.commitmentType === CommitmentType.SCHEDULED &&
    task.scheduledEnd !== null &&
    nowUtc.getTime() >= task.scheduledEnd.getTime()
  ) {
    return TaskStatus.NEEDS_CHECKIN;
  }

  return task.status;
}

/**
 * Validates whether an incoming background job execution is still authoritative
 * for the target task. Prevents stale reminders from firing after rescheduling or completion.
 */
export function isBackgroundJobStale(
  task: Pick<TaskScheduleSnapshot, "status" | "scheduleVersion" | "commitmentType">,
  jobScheduleVersion: number | null
): { stale: boolean; reason?: string } {
  if (
    task.status === TaskStatus.COMPLETED ||
    task.status === TaskStatus.ARCHIVED
  ) {
    return { stale: true, reason: `Task is already ${task.status}` };
  }

  if (task.commitmentType !== CommitmentType.SCHEDULED) {
    return {
      stale: true,
      reason: `Task commitmentType changed to ${task.commitmentType}`,
    };
  }

  if (
    jobScheduleVersion !== null &&
    task.scheduleVersion !== jobScheduleVersion
  ) {
    return {
      stale: true,
      reason: `Schedule version mismatch (task v${task.scheduleVersion} !== job v${jobScheduleVersion})`,
    };
  }

  return { stale: false };
}
