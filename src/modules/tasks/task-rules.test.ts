import { describe, expect, it } from "vitest";
import {
  CommitmentType,
  ScheduleChangeReason,
  TaskStatus,
} from "@prisma/client";
import {
  computeTaskScheduleTransition,
  evaluateElapsedCommitmentStatus,
  isBackgroundJobStale,
} from "./task-rules";

describe("Task Commitment & Rescheduling Domain Rules", () => {
  it("never assumes a task is completed when its scheduled time passes (transitions to NEEDS_CHECKIN)", () => {
    const scheduledEnd = new Date("2026-11-08T15:00:00.000Z");
    const afterEnd = new Date("2026-11-08T15:05:00.000Z");

    const status = evaluateElapsedCommitmentStatus(
      {
        commitmentType: CommitmentType.SCHEDULED,
        status: TaskStatus.ACTIVE,
        scheduledEnd,
      },
      afterEnd
    );

    expect(status).toBe(TaskStatus.NEEDS_CHECKIN);
    expect(status).not.toBe(TaskStatus.COMPLETED);
  });

  it("increments scheduleVersion and records history when rescheduling a task", () => {
    const initialStart = new Date("2026-11-08T14:00:00.000Z");
    const initialEnd = new Date("2026-11-08T16:00:00.000Z");
    const nextStart = new Date("2026-11-13T14:00:00.000Z");
    const nextEnd = new Date("2026-11-13T16:00:00.000Z");

    const transition = computeTaskScheduleTransition(
      {
        id: "task_1",
        commitmentType: CommitmentType.SCHEDULED,
        status: TaskStatus.NEEDS_CHECKIN,
        scheduledStart: initialStart,
        scheduledEnd: initialEnd,
        scheduleVersion: 1,
        postponeCount: 0,
      },
      {
        newCommitmentType: CommitmentType.SCHEDULED,
        newStart: nextStart,
        newEnd: nextEnd,
        reason: ScheduleChangeReason.USER_RESCHEDULED,
        note: "Moved attendance dashboard to Friday afternoon",
      }
    );

    expect(transition.nextTaskState.scheduleVersion).toBe(2);
    expect(transition.nextTaskState.postponeCount).toBe(1);
    expect(transition.nextTaskState.status).toBe(TaskStatus.ACTIVE);
    expect(transition.historyEntry.previousVersion).toBe(1);
    expect(transition.historyEntry.newVersion).toBe(2);
    expect(transition.historyEntry.previousStart).toEqual(initialStart);
    expect(transition.historyEntry.newStart).toEqual(nextStart);
  });

  it("clears scheduled calendar slots when converting a task to FLEXIBLE", () => {
    const initialStart = new Date("2026-11-08T14:00:00.000Z");
    const initialEnd = new Date("2026-11-08T16:00:00.000Z");

    const transition = computeTaskScheduleTransition(
      {
        id: "task_1",
        commitmentType: CommitmentType.SCHEDULED,
        status: TaskStatus.ACTIVE,
        scheduledStart: initialStart,
        scheduledEnd: initialEnd,
        scheduleVersion: 2,
        postponeCount: 1,
      },
      {
        newCommitmentType: CommitmentType.FLEXIBLE,
        reason: ScheduleChangeReason.MOVED_TO_FLEXIBLE,
      }
    );

    expect(transition.nextTaskState.commitmentType).toBe(
      CommitmentType.FLEXIBLE
    );
    expect(transition.nextTaskState.scheduledStart).toBeNull();
    expect(transition.nextTaskState.scheduledEnd).toBeNull();
    expect(transition.nextTaskState.scheduleVersion).toBe(3);
  });

  it("marks background jobs stale when scheduleVersion changes or task becomes FLEXIBLE", () => {
    const checkVersionMismatch = isBackgroundJobStale(
      {
        status: TaskStatus.ACTIVE,
        commitmentType: CommitmentType.SCHEDULED,
        scheduleVersion: 3,
      },
      2
    );
    expect(checkVersionMismatch.stale).toBe(true);

    const checkCurrent = isBackgroundJobStale(
      {
        status: TaskStatus.ACTIVE,
        commitmentType: CommitmentType.SCHEDULED,
        scheduleVersion: 3,
      },
      3
    );
    expect(checkCurrent.stale).toBe(false);
  });
});
