import {
  BackgroundJobKind,
  BackgroundJobStatus,
  CheckInFrequency,
  CommitmentType,
  NotificationCategory,
  TaskStatus,
} from "@prisma/client";
import { Temporal } from "temporal-polyfill";
import {
  getLocalWallClockInfo,
  isWithinQuietHours,
} from "@/lib/time/timezone";

export interface WakeupGuardJobSnapshot {
  status: BackgroundJobStatus;
  kind: BackgroundJobKind;
  taskScheduleVersion: number | null;
}

export interface WakeupGuardTaskSnapshot {
  status: TaskStatus;
  commitmentType: CommitmentType;
  scheduleVersion: number;
}

export interface WakeupGuardDecision {
  shouldDeliver: boolean;
  nextJobStatus: BackgroundJobStatus;
  reason?: string;
}

/**
 * Authoritative wake-up guard executed immediately before delivering any task reminder:
 * - Rejects cancelled/superseded jobs.
 * - Rejects tasks that were completed, archived, unscheduled, or rescheduled (`scheduleVersion` mismatch).
 * - Suppresses redundant `TASK_START_CONFIRMATION` when the user already marked the task `IN_PROGRESS`
 *   (Core Principle #7: never ask unnecessary questions when Orbit already knows).
 */
export function evaluateTaskJobWakeupGuard(
  job: WakeupGuardJobSnapshot,
  task: WakeupGuardTaskSnapshot | null
): WakeupGuardDecision {
  if (job.status !== BackgroundJobStatus.SCHEDULED) {
    return {
      shouldDeliver: false,
      nextJobStatus: job.status,
      reason: `JOB_ALREADY_${job.status}`,
    };
  }

  if (!task) {
    return {
      shouldDeliver: false,
      nextJobStatus: BackgroundJobStatus.CANCELLED,
      reason: "TASK_DELETED",
    };
  }

  if (
    task.status === TaskStatus.COMPLETED ||
    task.status === TaskStatus.ARCHIVED
  ) {
    return {
      shouldDeliver: false,
      nextJobStatus: BackgroundJobStatus.SUPERSEDED,
      reason: `TASK_${task.status}`,
    };
  }

  if (task.commitmentType !== CommitmentType.SCHEDULED) {
    return {
      shouldDeliver: false,
      nextJobStatus: BackgroundJobStatus.SUPERSEDED,
      reason: `COMMITMENT_CHANGED_TO_${task.commitmentType}`,
    };
  }

  if (
    job.taskScheduleVersion !== null &&
    task.scheduleVersion !== job.taskScheduleVersion
  ) {
    return {
      shouldDeliver: false,
      nextJobStatus: BackgroundJobStatus.SUPERSEDED,
      reason: `VERSION_MISMATCH_${job.taskScheduleVersion}_VS_${task.scheduleVersion}`,
    };
  }

  if (
    job.kind === BackgroundJobKind.TASK_START_CONFIRMATION &&
    task.status === TaskStatus.IN_PROGRESS
  ) {
    return {
      shouldDeliver: false,
      nextJobStatus: BackgroundJobStatus.COMPLETED,
      reason: "ALREADY_IN_PROGRESS",
    };
  }

  return {
    shouldDeliver: true,
    nextJobStatus: BackgroundJobStatus.COMPLETED,
  };
}

export interface InterruptionPreferenceSnapshot {
  ianaTimeZone: string;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  declaredWakeTime: string;
  declaredSleepTime: string;
  maxDailyCheckIns: number;
  randomCheckInsEnabled: boolean;
  checkInFrequency: CheckInFrequency;
  minMinutesBetweenCheckIns: number;
}

export interface DeliveryPolicyContext {
  category: NotificationCategory;
  nowUtc: Date;
  preferences: InterruptionPreferenceSnapshot;
  deliveredTodayCount: number;
  lastDeliveredAtUtc: Date | null;
  forceBypassLimits?: boolean;
}

export interface DeliveryPolicyDecision {
  allowDelivery: boolean;
  suppressedByQuietHours: boolean;
  reason?: string;
}

export function resolveEffectiveMinGapMinutes(
  pref: InterruptionPreferenceSnapshot
): number {
  if (pref.checkInFrequency === CheckInFrequency.MINIMAL) {
    return Math.max(pref.minMinutesBetweenCheckIns, 240);
  }
  if (pref.checkInFrequency === CheckInFrequency.PROACTIVE) {
    return Math.max(45, Math.min(pref.minMinutesBetweenCheckIns, 90));
  }
  return Math.max(60, pref.minMinutesBetweenCheckIns);
}

/**
 * Evaluates quiet hours, waking window, daily interruption cap, and spacing
 * between check-ins so Orbit never overwhelms the user (Core Principle #8).
 */
export function evaluateNotificationDeliveryPolicy(
  ctx: DeliveryPolicyContext
): DeliveryPolicyDecision {
  if (ctx.forceBypassLimits) {
    return { allowDelivery: true, suppressedByQuietHours: false };
  }

  const { preferences: pref, nowUtc, category } = ctx;

  if (
    pref.quietHoursEnabled &&
    isWithinQuietHours(
      nowUtc,
      pref.ianaTimeZone,
      pref.quietHoursStart,
      pref.quietHoursEnd
    )
  ) {
    return {
      allowDelivery: false,
      suppressedByQuietHours: true,
      reason: "QUIET_HOURS",
    };
  }

  if (
    category !== NotificationCategory.MORNING_BRIEFING &&
    ctx.deliveredTodayCount >= pref.maxDailyCheckIns
  ) {
    return {
      allowDelivery: false,
      suppressedByQuietHours: false,
      reason: "DAILY_CAP_REACHED",
    };
  }

  if (category === NotificationCategory.RANDOM_CHECKIN) {
    if (!pref.randomCheckInsEnabled) {
      return {
        allowDelivery: false,
        suppressedByQuietHours: false,
        reason: "RANDOM_CHECKINS_DISABLED",
      };
    }

    const wall = getLocalWallClockInfo(nowUtc, pref.ianaTimeZone);
    const nowPlain = Temporal.PlainTime.from(wall.localTimeHHmm);
    const wakePlain = Temporal.PlainTime.from(pref.declaredWakeTime);
    const sleepPlain = Temporal.PlainTime.from(pref.declaredSleepTime);

    const withinWakingDay =
      Temporal.PlainTime.compare(wakePlain, sleepPlain) <= 0
        ? Temporal.PlainTime.compare(nowPlain, wakePlain) >= 0 &&
          Temporal.PlainTime.compare(nowPlain, sleepPlain) <= 0
        : Temporal.PlainTime.compare(nowPlain, wakePlain) >= 0 ||
          Temporal.PlainTime.compare(nowPlain, sleepPlain) <= 0;

    if (!withinWakingDay) {
      return {
        allowDelivery: false,
        suppressedByQuietHours: false,
        reason: "OUTSIDE_WAKING_HOURS",
      };
    }

    if (ctx.lastDeliveredAtUtc) {
      const elapsedMinutes =
        (nowUtc.getTime() - ctx.lastDeliveredAtUtc.getTime()) / (60 * 1000);
      const minGap = resolveEffectiveMinGapMinutes(pref);
      if (elapsedMinutes < minGap) {
        return {
          allowDelivery: false,
          suppressedByQuietHours: false,
          reason: "COOLDOWN_ACTIVE",
        };
      }
    }
  }

  return {
    allowDelivery: true,
    suppressedByQuietHours: false,
  };
}
