import { describe, expect, it } from "vitest";
import {
  BackgroundJobKind,
  BackgroundJobStatus,
  CheckInFrequency,
  CommitmentType,
  NotificationCategory,
  TaskStatus,
} from "@prisma/client";
import {
  evaluateNotificationDeliveryPolicy,
  evaluateTaskJobWakeupGuard,
} from "./notification-rules";
import { buildTaskReminderPlan } from "@/modules/outbox/outbox-service";

describe("Proactive check-in wake-up guard & outbox reminder planning", () => {
  it("builds deterministic pre-task, start, and end jobs with versioned idempotency keys", () => {
    const now = new Date("2026-11-08T08:00:00Z");
    const start = new Date("2026-11-08T10:00:00Z");
    const end = new Date("2026-11-08T11:00:00Z");

    const plan = buildTaskReminderPlan({
      taskId: "tsk_123",
      scheduleVersion: 3,
      scheduledStart: start,
      scheduledEnd: end,
      preTaskReminderMinutes: 30,
      nowUtc: now,
    });

    expect(plan).toHaveLength(3);
    expect(plan.map((j) => j.idempotencyKey)).toEqual([
      "task:tsk_123:v3:PRE_TASK_REMINDER",
      "task:tsk_123:v3:TASK_START_CONFIRMATION",
      "task:tsk_123:v3:TASK_END_CONFIRMATION",
    ]);
    expect(plan[0]?.scheduledFor.toISOString()).toBe("2026-11-08T09:30:00.000Z");
  });

  it("supersedes a waking job when the task scheduleVersion moved ahead", () => {
    const res = evaluateTaskJobWakeupGuard(
      {
        status: BackgroundJobStatus.SCHEDULED,
        kind: BackgroundJobKind.PRE_TASK_REMINDER,
        taskScheduleVersion: 1,
      },
      {
        status: TaskStatus.ACTIVE,
        commitmentType: CommitmentType.SCHEDULED,
        scheduleVersion: 2,
      }
    );

    expect(res.shouldDeliver).toBe(false);
    expect(res.nextJobStatus).toBe(BackgroundJobStatus.SUPERSEDED);
    expect(res.reason).toContain("VERSION_MISMATCH");
  });

  it("skips redundant start confirmation when user already marked task IN_PROGRESS", () => {
    const res = evaluateTaskJobWakeupGuard(
      {
        status: BackgroundJobStatus.SCHEDULED,
        kind: BackgroundJobKind.TASK_START_CONFIRMATION,
        taskScheduleVersion: 2,
      },
      {
        status: TaskStatus.IN_PROGRESS,
        commitmentType: CommitmentType.SCHEDULED,
        scheduleVersion: 2,
      }
    );

    expect(res.shouldDeliver).toBe(false);
    expect(res.nextJobStatus).toBe(BackgroundJobStatus.COMPLETED);
    expect(res.reason).toBe("ALREADY_IN_PROGRESS");
  });

  it("suppresses check-ins during local overnight quiet hours and enforces cooldowns", () => {
    const basePref = {
      ianaTimeZone: "Africa/Lagos", // UTC+1
      quietHoursEnabled: true,
      quietHoursStart: "22:00",
      quietHoursEnd: "07:00",
      declaredWakeTime: "07:00",
      declaredSleepTime: "22:30",
      maxDailyCheckIns: 5,
      randomCheckInsEnabled: true,
      checkInFrequency: CheckInFrequency.BALANCED,
      minMinutesBetweenCheckIns: 120,
    };

    // 22:30 in Africa/Lagos = 21:30 UTC -> inside quiet hours
    const quietRes = evaluateNotificationDeliveryPolicy({
      category: NotificationCategory.PRE_COMMITMENT_CHECKIN,
      nowUtc: new Date("2026-11-08T21:30:00Z"),
      preferences: basePref,
      deliveredTodayCount: 1,
      lastDeliveredAtUtc: null,
    });
    expect(quietRes.allowDelivery).toBe(false);
    expect(quietRes.suppressedByQuietHours).toBe(true);

    // 14:00 in Africa/Lagos = 13:00 UTC, but last check-in was 45 mins ago -> cooldown blocks random check-in
    const cooldownRes = evaluateNotificationDeliveryPolicy({
      category: NotificationCategory.RANDOM_CHECKIN,
      nowUtc: new Date("2026-11-08T13:00:00Z"),
      preferences: basePref,
      deliveredTodayCount: 2,
      lastDeliveredAtUtc: new Date("2026-11-08T12:15:00Z"),
    });
    expect(cooldownRes.allowDelivery).toBe(false);
    expect(cooldownRes.reason).toBe("COOLDOWN_ACTIVE");
  });
});
