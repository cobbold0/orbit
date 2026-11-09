"use server";

import { revalidatePath } from "next/cache";
import {
  CaptureKind,
  CheckInFrequency,
  CommitmentType,
  NotificationDeliveryStatus,
  ProjectKind,
  ProjectStatus,
  RoutineKind,
  ScheduleChangeReason,
  TaskPriority,
} from "@prisma/client";
import { Temporal } from "temporal-polyfill";
import { GoogleGenAI } from "@google/genai";
import { getCurrentUser } from "@/lib/auth/session";
import {
  confirmTaskCompletion,
  createStructuredTask,
  createTaskWithQuickCapture,
  deleteTask,
  markTaskStarted,
  rescheduleOrChangeCommitment,
  updateTask,
} from "@/modules/tasks/task-service";
import {
  addMilestoneToProject,
  createLifeArea,
  createProjectOrJourney,
  cycleMilestoneStatus,
  deleteLifeArea,
  deleteMilestone,
  reorderLifeAreas,
  updateLifeArea,
  updateMilestone,
  updateProjectOrJourney,
} from "@/modules/life-areas/life-area-service";
import {
  createDeclaredRoutine,
  deleteRoutine,
  logExplicitActivityCheckIn,
  resolveInferredActivity,
  resolveSuggestedRoutine,
  updateDeclaredRoutine,
} from "@/modules/activity/activity-service";
import {
  approveAllActionableForEntry,
  captureAndProcessMemoryEntry,
  reviewAndResolveExtractedAction,
} from "@/modules/memory-inbox/memory-inbox-service";
import { retrieveUserOrbitContext } from "@/modules/ai/context-retriever";
import { aiGateway } from "@/lib/ai/ai-provider";
import type {
  ConversationalPlanResponse,
  ProposedMutation,
} from "@/lib/ai/schemas";
import { resolveLocalDateTimeToUtc } from "@/lib/time/timezone";
import { prisma } from "@/lib/db/prisma";
import {
  evaluateDueBackgroundJobs,
  generateMorningBriefingForUser,
  generateRandomActivityCheckIn,
  generateTaskCheckInSample,
  removeUserPushSubscription,
  respondToNotification,
  updateUserPreferences,
} from "@/modules/notifications/notification-service";
import { sendPushToUserDevices } from "@/lib/push/web-push";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { evaluateUserRoutineIntelligence } from "@/modules/routines/routine-intelligence";

function revalidateAllOrbitViews() {
  revalidatePath("/");
  revalidatePath("/timeline");
  revalidatePath("/areas", "layout");
  revalidatePath("/routines");
  revalidatePath("/inbox");
  revalidatePath("/settings");
  revalidatePath("/check-in", "layout");
}

async function requireUserId(): Promise<string> {
  const user = await getCurrentUser();
  if (!user?.id) {
    throw new Error("Authentication required.");
  }
  return user.id;
}

export async function quickCaptureAction(formData: FormData) {
  const userId = await requireUserId();
  const rawInput = String(formData.get("rawInput") ?? "").trim();
  const lifeAreaId = String(formData.get("lifeAreaId") ?? "").trim();

  if (!rawInput) return;

  await createTaskWithQuickCapture(
    userId,
    rawInput,
    lifeAreaId || undefined
  );
  revalidateAllOrbitViews();
}

export async function createStructuredTaskAction(formData: FormData) {
  const userId = await requireUserId();
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const lifeAreaId = String(formData.get("lifeAreaId") ?? "").trim();
  const projectId = String(formData.get("projectId") ?? "").trim() || null;
  const commitmentType = (formData.get("commitmentType") as CommitmentType) ?? CommitmentType.FLEXIBLE;
  const priority = (formData.get("priority") as TaskPriority) ?? TaskPriority.NORMAL;
  const estimatedMinutesRaw = String(formData.get("estimatedMinutes") ?? "").trim();
  const estimatedMinutes = estimatedMinutesRaw ? parseInt(estimatedMinutesRaw, 10) : null;
  const dueDateStr = String(formData.get("dueDate") ?? "").trim();
  const scheduledDateStr = String(formData.get("scheduledDate") ?? "").trim();
  const scheduledTimeStr = String(formData.get("scheduledTime") ?? "").trim();
  const flexibilityWindow = String(formData.get("flexibilityWindow") ?? "THIS_WEEK").trim();
  const waitingOnPerson = String(formData.get("waitingOnPerson") ?? "").trim();
  const waitingOnCondition = String(formData.get("waitingOnCondition") ?? "").trim();

  if (!title || !lifeAreaId) return;

  const pref = await prisma.userPreference.findUnique({ where: { userId } });
  const ianaTimeZone = pref?.ianaTimeZone ?? "Africa/Lagos";

  let scheduledStart: Date | null = null;
  let scheduledEnd: Date | null = null;
  if (
    commitmentType === CommitmentType.SCHEDULED &&
    scheduledDateStr &&
    scheduledTimeStr
  ) {
    const resolved = resolveLocalDateTimeToUtc(
      scheduledDateStr,
      scheduledTimeStr,
      ianaTimeZone
    );
    scheduledStart = resolved.instantUtc;
    const dur = estimatedMinutes ?? 60;
    scheduledEnd = new Date(scheduledStart.getTime() + dur * 60 * 1000);
  }

  let dueDate: Date | null = null;
  if (dueDateStr) {
    dueDate = resolveLocalDateTimeToUtc(dueDateStr, "18:00", ianaTimeZone).instantUtc;
  }

  await createStructuredTask(userId, {
    title,
    description,
    lifeAreaId,
    projectId,
    commitmentType,
    priority,
    estimatedMinutes,
    dueDate,
    scheduledStart,
    scheduledEnd,
    flexibilityWindow,
    waitingOnPerson,
    waitingOnCondition,
  });

  revalidateAllOrbitViews();
}

export async function completeTaskAction(formData: FormData) {
  const userId = await requireUserId();
  const taskId = String(formData.get("taskId") ?? "");
  if (!taskId) return;

  await confirmTaskCompletion(userId, taskId);
  revalidateAllOrbitViews();
}

export async function updateTaskAction(formData: FormData) {
  const userId = await requireUserId();
  const taskId = String(formData.get("taskId") ?? "").trim();
  if (!taskId) return;

  const title = String(formData.get("title") ?? "").trim();
  const lifeAreaId =
    String(formData.get("lifeAreaId") ?? "").trim() || undefined;
  const projectId = formData.has("projectId")
    ? String(formData.get("projectId") ?? "").trim() || null
    : undefined;
  const priority = (formData.get("priority") as TaskPriority) || undefined;
  const estimatedRaw = formData.get("estimatedMinutes");
  const estimatedMinutes = estimatedRaw
    ? parseInt(String(estimatedRaw), 10)
    : undefined;
  const notes = formData.has("notes")
    ? String(formData.get("notes") ?? "")
    : undefined;

  await updateTask(userId, taskId, {
    ...(title ? { title } : {}),
    lifeAreaId,
    projectId,
    priority,
    estimatedMinutes: Number.isNaN(estimatedMinutes) ? undefined : estimatedMinutes,
    notes,
  });

  revalidateAllOrbitViews();
}

export async function deleteTaskAction(formData: FormData) {
  const userId = await requireUserId();
  const taskId = String(formData.get("taskId") ?? "").trim();
  if (!taskId) return;

  await deleteTask(userId, taskId);
  revalidateAllOrbitViews();
}

export async function startTaskAction(formData: FormData) {
  const userId = await requireUserId();
  const taskId = String(formData.get("taskId") ?? "");
  if (!taskId) return;

  await markTaskStarted(userId, taskId);
  revalidateAllOrbitViews();
}

export async function recoverOrRescheduleTaskAction(formData: FormData) {
  const userId = await requireUserId();
  const taskId = String(formData.get("taskId") ?? "");
  const recoveryKind = String(formData.get("recoveryKind") ?? "");
  if (!taskId || !recoveryKind) return;

  const task = await prisma.task.findFirst({ where: { id: taskId, userId } });
  if (!task) return;

  const now = new Date();

  if (recoveryKind === "STILL_WORKING_30M") {
    const newStart = task.scheduledStart ?? now;
    const newEnd = new Date(now.getTime() + 30 * 60 * 1000);
    await rescheduleOrChangeCommitment(userId, taskId, {
      newCommitmentType: CommitmentType.SCHEDULED,
      newStart,
      newEnd,
      reason: ScheduleChangeReason.USER_RESCHEDULED,
      note: "Extended commitment by 30 minutes (still working)",
    });
  } else if (
    recoveryKind === "TOMORROW_MORNING" ||
    recoveryKind === "TOMORROW_AFTERNOON"
  ) {
    const pref = await prisma.userPreference.findUnique({ where: { userId } });
    const ianaTimeZone = pref?.ianaTimeZone ?? "Africa/Lagos";
    const tomorrowLocal = Temporal.Instant.fromEpochMilliseconds(now.getTime())
      .toZonedDateTimeISO(ianaTimeZone)
      .toPlainDate()
      .add({ days: 1 })
      .toString();
    const targetClock =
      recoveryKind === "TOMORROW_MORNING" ? "09:30" : "14:00";
    const resolved = resolveLocalDateTimeToUtc(
      tomorrowLocal,
      targetClock,
      ianaTimeZone
    );
    const dur = task.estimatedMinutes ?? 60;
    const newEnd = new Date(resolved.instantUtc.getTime() + dur * 60 * 1000);

    await rescheduleOrChangeCommitment(userId, taskId, {
      newCommitmentType: CommitmentType.SCHEDULED,
      newStart: resolved.instantUtc,
      newEnd,
      reason: ScheduleChangeReason.USER_RESCHEDULED,
      note:
        recoveryKind === "TOMORROW_MORNING"
          ? "Moved to tomorrow morning"
          : "Moved to tomorrow afternoon",
    });
  } else if (recoveryKind === "CUSTOM_SCHEDULE") {
    const scheduledDate = String(formData.get("scheduledDate") ?? "").trim();
    const scheduledTime =
      String(formData.get("scheduledTime") ?? "").trim() || "14:00";
    if (scheduledDate) {
      const pref = await prisma.userPreference.findUnique({ where: { userId } });
      const ianaTimeZone = pref?.ianaTimeZone ?? "Africa/Lagos";
      const resolved = resolveLocalDateTimeToUtc(
        scheduledDate,
        scheduledTime,
        ianaTimeZone
      );
      const dur = task.estimatedMinutes ?? 60;
      const newEnd = new Date(resolved.instantUtc.getTime() + dur * 60 * 1000);
      await rescheduleOrChangeCommitment(userId, taskId, {
        newCommitmentType: CommitmentType.SCHEDULED,
        newStart: resolved.instantUtc,
        newEnd,
        reason: ScheduleChangeReason.USER_RESCHEDULED,
        note: `Scheduled for ${scheduledDate} at ${scheduledTime}`,
      });
    }
  } else if (recoveryKind === "MAKE_FLEXIBLE") {
    await rescheduleOrChangeCommitment(userId, taskId, {
      newCommitmentType: CommitmentType.FLEXIBLE,
      flexibilityWindow: "THIS_WEEK",
      reason: ScheduleChangeReason.MOVED_TO_FLEXIBLE,
      note: "Returned to flexible task pool",
    });
  } else if (recoveryKind === "SLOT_INTO_WINDOW") {
    const startIso = String(formData.get("windowStartIso") ?? "");
    if (startIso) {
      const newStart = new Date(startIso);
      const dur = task.estimatedMinutes ?? 45;
      const newEnd = new Date(newStart.getTime() + dur * 60 * 1000);
      await rescheduleOrChangeCommitment(userId, taskId, {
        newCommitmentType: CommitmentType.SCHEDULED,
        newStart,
        newEnd,
        reason: ScheduleChangeReason.USER_RESCHEDULED,
        note: "Slotted into available timeline window",
      });
    }
  }

  revalidateAllOrbitViews();
}

export async function createLifeAreaAction(formData: FormData) {
  const userId = await requireUserId();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const colorToken = String(formData.get("colorToken") ?? "slate").trim();
  const iconName = String(formData.get("iconName") ?? "CircleDot").trim();
  if (!name) return;

  await createLifeArea(userId, { name, description, colorToken, iconName });
  revalidateAllOrbitViews();
}

export async function updateLifeAreaAction(formData: FormData) {
  const userId = await requireUserId();
  const areaId = String(formData.get("areaId") ?? "");
  const operation = String(formData.get("operation") ?? "");
  if (!areaId) return;

  if (operation === "ARCHIVE") {
    await updateLifeArea(userId, areaId, { isArchived: true });
  } else if (operation === "RESTORE") {
    await updateLifeArea(userId, areaId, { isArchived: false });
  } else if (operation === "MOVE_UP") {
    await updateLifeArea(userId, areaId, { direction: "UP" });
  } else if (operation === "MOVE_DOWN") {
    await updateLifeArea(userId, areaId, { direction: "DOWN" });
  } else if (operation === "RENAME" || operation === "EDIT") {
    const name = String(formData.get("name") ?? "").trim();
    const colorToken = String(formData.get("colorToken") ?? "").trim();
    const iconName = String(formData.get("iconName") ?? "").trim();
    const description = formData.has("description")
      ? String(formData.get("description") ?? "")
      : undefined;
    await updateLifeArea(userId, areaId, {
      ...(name ? { name } : {}),
      ...(colorToken ? { colorToken } : {}),
      ...(iconName ? { iconName } : {}),
      ...(description !== undefined ? { description } : {}),
    });
  }

  revalidateAllOrbitViews();
}

export async function reorderLifeAreasAction(orderedAreaIds: string[]) {
  const userId = await requireUserId();
  await reorderLifeAreas(userId, orderedAreaIds);
  revalidateAllOrbitViews();
}

export async function deleteLifeAreaAction(
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const userId = await requireUserId();
  const areaId = String(formData.get("areaId") ?? "").trim();
  if (!areaId) return { ok: false, error: "Area not found." };

  try {
    await deleteLifeArea(userId, areaId);
    revalidateAllOrbitViews();
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not delete area.",
    };
  }
}

export async function updateProjectAction(formData: FormData) {
  const userId = await requireUserId();
  const projectId = String(formData.get("projectId") ?? "").trim();
  if (!projectId) return;

  const operation = String(formData.get("operation") ?? "EDIT");
  if (operation === "ARCHIVE") {
    await updateProjectOrJourney(userId, projectId, {
      status: ProjectStatus.ARCHIVED,
    });
    revalidateAllOrbitViews();
    return;
  }

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "");
  const lifeAreaId = String(formData.get("lifeAreaId") ?? "").trim();
  const kind = (formData.get("kind") as ProjectKind) || undefined;

  await updateProjectOrJourney(userId, projectId, {
    ...(title ? { title } : {}),
    description,
    ...(lifeAreaId ? { lifeAreaId } : {}),
    ...(kind ? { kind } : {}),
  });

  revalidateAllOrbitViews();
}

export async function createRoutineAction(formData: FormData) {
  const userId = await requireUserId();
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;

  const lifeAreaId = String(formData.get("lifeAreaId") ?? "").trim() || null;
  const kind =
    (formData.get("kind") as RoutineKind) || RoutineKind.WORK_BLOCK;
  const startTimeLocal =
    String(formData.get("startTimeLocal") ?? "").trim() || "09:00";
  const endTimeLocal =
    String(formData.get("endTimeLocal") ?? "").trim() || "17:00";
  const physicalLocation =
    String(formData.get("physicalLocation") ?? "").trim() || null;
  const daysOfWeek = formData
    .getAll("daysOfWeek")
    .map((v) => parseInt(String(v), 10))
    .filter((n) => !Number.isNaN(n) && n >= 1 && n <= 7);

  await createDeclaredRoutine(userId, {
    title,
    lifeAreaId,
    kind,
    daysOfWeek,
    startTimeLocal,
    endTimeLocal,
    physicalLocation,
  });

  revalidateAllOrbitViews();
}

export async function updateRoutineAction(formData: FormData) {
  const userId = await requireUserId();
  const routineId = String(formData.get("routineId") ?? "").trim();
  if (!routineId) return;

  const title = String(formData.get("title") ?? "").trim();
  const lifeAreaId = String(formData.get("lifeAreaId") ?? "").trim() || null;
  const kind = (formData.get("kind") as RoutineKind) || undefined;
  const startTimeLocal =
    String(formData.get("startTimeLocal") ?? "").trim() || undefined;
  const endTimeLocal =
    String(formData.get("endTimeLocal") ?? "").trim() || undefined;
  const physicalLocation = String(formData.get("physicalLocation") ?? "").trim();
  const daysOfWeek = formData
    .getAll("daysOfWeek")
    .map((v) => parseInt(String(v), 10))
    .filter((n) => !Number.isNaN(n) && n >= 1 && n <= 7);

  await updateDeclaredRoutine(userId, routineId, {
    ...(title ? { title } : {}),
    lifeAreaId,
    kind,
    startTimeLocal,
    endTimeLocal,
    physicalLocation,
    daysOfWeek: daysOfWeek.length > 0 ? daysOfWeek : undefined,
  });

  revalidateAllOrbitViews();
}

export async function deleteRoutineAction(formData: FormData) {
  const userId = await requireUserId();
  const routineId = String(formData.get("routineId") ?? "").trim();
  if (!routineId) return;

  await deleteRoutine(userId, routineId);
  revalidateAllOrbitViews();
}

export async function createProjectAction(formData: FormData) {
  const userId = await requireUserId();
  const lifeAreaId = String(formData.get("lifeAreaId") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const kind = (formData.get("kind") as ProjectKind) ?? ProjectKind.PROJECT;
  const milestonesRaw = String(formData.get("milestonesRaw") ?? "").trim();

  if (!lifeAreaId || !title) return;

  const initialMilestones = milestonesRaw
    ? milestonesRaw
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  await createProjectOrJourney(userId, {
    lifeAreaId,
    title,
    description,
    kind,
    initialMilestones,
  });

  revalidateAllOrbitViews();
}

export async function cycleMilestoneAction(formData: FormData) {
  const userId = await requireUserId();
  const milestoneId = String(formData.get("milestoneId") ?? "");
  if (!milestoneId) return;

  await cycleMilestoneStatus(userId, milestoneId);
  revalidateAllOrbitViews();
}

export async function addMilestoneAction(formData: FormData) {
  const userId = await requireUserId();
  const projectId = String(formData.get("projectId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  if (!projectId || !title) return;

  await addMilestoneToProject(userId, projectId, title);
  revalidateAllOrbitViews();
}

export async function updateMilestoneAction(formData: FormData) {
  const userId = await requireUserId();
  const milestoneId = String(formData.get("milestoneId") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  if (!milestoneId || !title) return;

  await updateMilestone(userId, milestoneId, title);
  revalidateAllOrbitViews();
}

export async function deleteMilestoneAction(formData: FormData) {
  const userId = await requireUserId();
  const milestoneId = String(formData.get("milestoneId") ?? "").trim();
  if (!milestoneId) return;

  await deleteMilestone(userId, milestoneId);
  revalidateAllOrbitViews();
}

export async function logActivityCheckInAction(formData: FormData) {
  const userId = await requireUserId();
  const title = String(formData.get("title") ?? "").trim();
  const lifeAreaId = String(formData.get("lifeAreaId") ?? "").trim() || null;
  const physicalLocation =
    String(formData.get("physicalLocation") ?? "").trim() || null;
  const durationMinutes = parseInt(
    String(formData.get("durationMinutes") ?? "45"),
    10
  );

  if (!title) return;

  await logExplicitActivityCheckIn(userId, {
    title,
    lifeAreaId,
    physicalLocation,
    durationMinutes: Number.isNaN(durationMinutes) ? 45 : durationMinutes,
  });

  revalidateAllOrbitViews();
}

export async function resolveInferredActivityAction(formData: FormData) {
  const userId = await requireUserId();
  const activityId = String(formData.get("activityId") ?? "");
  const decision = String(formData.get("decision") ?? "") as
    | "CONFIRM"
    | "DISMISS";
  if (!activityId || (decision !== "CONFIRM" && decision !== "DISMISS")) return;

  await resolveInferredActivity(userId, activityId, decision);
  revalidateAllOrbitViews();
}

export async function resolveSuggestedRoutineAction(formData: FormData) {
  const userId = await requireUserId();
  const routineId = String(formData.get("routineId") ?? "");
  const decision = String(formData.get("decision") ?? "") as
    | "APPROVE"
    | "DISMISS";
  if (!routineId || (decision !== "APPROVE" && decision !== "DISMISS")) return;

  await resolveSuggestedRoutine(userId, routineId, decision);
  revalidateAllOrbitViews();
}

// ============================================================================
// PHASE 3: MEMORY INBOX, VOICE CAPTURE & CONVERSATIONAL PLANNING ACTIONS
// ============================================================================

export async function captureMemoryInboxAction(formData: FormData) {
  const userId = await requireUserId();

  const rateCheck = checkRateLimit(`${userId}:capture_memory`, 30, 60_000);
  if (!rateCheck.success) {
    throw new Error("Rate limit exceeded for memory capture. Please wait a moment.");
  }

  const title = String(formData.get("title") ?? "").trim() || null;
  const rawContent = String(formData.get("rawContent") ?? "").trim();
  const captureKind =
    (formData.get("captureKind") as CaptureKind) ?? CaptureKind.TEXT_NOTE;
  const speakerContext =
    String(formData.get("speakerContext") ?? "").trim() || null;
  const voiceDurationRaw = String(formData.get("voiceDurationSec") ?? "").trim();
  const voiceDurationSec = voiceDurationRaw
    ? parseInt(voiceDurationRaw, 10)
    : null;
  const consentConfirmed = formData.get("consentConfirmed") !== "false";

  if (!rawContent) return;
  if (rawContent.length > 20_000) {
    throw new Error("Content exceeds maximum allowed size (20,000 characters).");
  }

  await captureAndProcessMemoryEntry(userId, {
    title,
    rawContent,
    captureKind,
    speakerContext,
    voiceDurationSec,
    consentConfirmed,
  });

  revalidateAllOrbitViews();
}

export async function resolveExtractedActionAction(formData: FormData) {
  const userId = await requireUserId();
  const extractedActionId = String(formData.get("extractedActionId") ?? "");
  const decision = String(formData.get("decision") ?? "") as
    | "APPROVE"
    | "DISMISS";
  const overrideTitle =
    String(formData.get("overrideTitle") ?? "").trim() || undefined;
  const overrideLifeAreaId =
    String(formData.get("overrideLifeAreaId") ?? "").trim() || undefined;
  const overrideCommitmentType =
    (String(formData.get("overrideCommitmentType") ?? "").trim() as
      | CommitmentType
      | "") || undefined;

  if (
    !extractedActionId ||
    (decision !== "APPROVE" && decision !== "DISMISS")
  ) {
    return;
  }

  await reviewAndResolveExtractedAction(userId, extractedActionId, {
    decision,
    overrideTitle,
    overrideLifeAreaId,
    overrideCommitmentType,
  });

  revalidateAllOrbitViews();
}

export async function approveAllActionableInboxAction(formData: FormData) {
  const userId = await requireUserId();
  const inboxEntryId = String(formData.get("inboxEntryId") ?? "");
  if (!inboxEntryId) return;

  await approveAllActionableForEntry(userId, inboxEntryId);
  revalidateAllOrbitViews();
}

export async function askOrbitPlannerAction(
  userMessage: string
): Promise<ConversationalPlanResponse> {
  const userId = await requireUserId();

  const rateCheck = checkRateLimit(`${userId}:ask_planner`, 20, 60_000);
  if (!rateCheck.success) {
    return {
      replyMarkdown: "You are sending messages too quickly. Please wait a minute before asking Orbit again.",
      citedFacts: [],
      assumptionsOrSuggestions: ["Rate limit reached. Please wait before retrying."],
      proposedMutations: [],
      providerUsed: "DETERMINISTIC_FALLBACK",
    };
  }

  const trimmed = userMessage.trim();
  if (trimmed.length > 2_500) {
    return {
      replyMarkdown: "Your message is too long (limit is 2,500 characters). Please provide a more concise request.",
      citedFacts: [],
      assumptionsOrSuggestions: ["Input message exceeds maximum character count."],
      proposedMutations: [],
      providerUsed: "DETERMINISTIC_FALLBACK",
    };
  }

  const context = await retrieveUserOrbitContext(userId, new Date(), trimmed);
  return aiGateway.planWithContext(trimmed, context);
}

export async function applyProposedMutationAction(
  mutation: ProposedMutation
): Promise<{ ok: boolean; confirmationMessage: string }> {
  const userId = await requireUserId();
  const pref = await prisma.userPreference.findUnique({ where: { userId } });
  const ianaTimeZone = pref?.ianaTimeZone ?? "Africa/Lagos";

  if (mutation.mutationKind === "RESCHEDULE_TASK") {
    const task = await prisma.task.findFirst({
      where: { id: mutation.taskId, userId },
    });
    if (!task) {
      return { ok: false, confirmationMessage: "Task no longer exists." };
    }

    let newStart: Date | null = null;
    let newEnd: Date | null = null;

    if (
      mutation.newCommitmentType === "SCHEDULED" &&
      mutation.targetDateStr &&
      mutation.targetTimeStr
    ) {
      const resolved = resolveLocalDateTimeToUtc(
        mutation.targetDateStr,
        mutation.targetTimeStr,
        ianaTimeZone
      );
      newStart = resolved.instantUtc;
      const dur = task.estimatedMinutes ?? 60;
      newEnd = new Date(newStart.getTime() + dur * 60 * 1000);
    }

    await rescheduleOrChangeCommitment(userId, task.id, {
      newCommitmentType: mutation.newCommitmentType as CommitmentType,
      newStart,
      newEnd,
      flexibilityWindow: mutation.flexibilityWindow ?? "THIS_WEEK",
      reason: ScheduleChangeReason.AI_PROPOSED_USER_APPROVED,
      note: mutation.explanation,
    });

    revalidateAllOrbitViews();
    return {
      ok: true,
      confirmationMessage: `Confirmed: "${task.title}" updated (${mutation.explanation})`,
    };
  }

  if (mutation.mutationKind === "UPDATE_PREFERENCE") {
    const updateData: {
      declaredSleepTime?: string;
      declaredWakeTime?: string;
      quietHoursEnabled?: boolean;
      quietHoursStart?: string;
      quietHoursEnd?: string;
      checkInFrequency?: CheckInFrequency;
      maxDailyCheckIns?: number;
      defaultPreTaskReminderMin?: number;
    } = {};

    if (mutation.declaredSleepTime) updateData.declaredSleepTime = mutation.declaredSleepTime;
    if (mutation.declaredWakeTime) updateData.declaredWakeTime = mutation.declaredWakeTime;
    if (mutation.quietHoursEnabled !== undefined && mutation.quietHoursEnabled !== null) {
      updateData.quietHoursEnabled = mutation.quietHoursEnabled;
    }
    if (mutation.quietHoursStart) updateData.quietHoursStart = mutation.quietHoursStart;
    if (mutation.quietHoursEnd) updateData.quietHoursEnd = mutation.quietHoursEnd;
    if (mutation.checkInFrequency) updateData.checkInFrequency = mutation.checkInFrequency as CheckInFrequency;
    if (mutation.maxDailyCheckIns) updateData.maxDailyCheckIns = mutation.maxDailyCheckIns;
    if (mutation.defaultPreTaskReminderMin) updateData.defaultPreTaskReminderMin = mutation.defaultPreTaskReminderMin;

    await updateUserPreferences(userId, updateData);
    revalidateAllOrbitViews();
    return {
      ok: true,
      confirmationMessage: `Confirmed: Updated preferences (${mutation.explanation}).`,
    };
  }

  if (mutation.mutationKind === "COMPLETE_TASK") {
    await confirmTaskCompletion(userId, mutation.taskId);
    revalidateAllOrbitViews();
    return {
      ok: true,
      confirmationMessage: `Confirmed: Completed "${mutation.taskTitle}".`,
    };
  }

  if (mutation.mutationKind === "CREATE_PROJECT") {
    await createProjectOrJourney(userId, {
      lifeAreaId: mutation.lifeAreaId,
      title: mutation.title,
      description: mutation.description ?? "",
      kind: mutation.kind === "JOURNEY" ? ProjectKind.JOURNEY : ProjectKind.PROJECT,
      initialMilestones: mutation.initialMilestones ?? [],
    });
    revalidateAllOrbitViews();
    return {
      ok: true,
      confirmationMessage: `Confirmed: Created project "${mutation.title}" under ${mutation.lifeAreaName}.`,
    };
  }

  if (mutation.mutationKind === "CREATE_ROUTINE") {
    await createDeclaredRoutine(userId, {
      title: mutation.title,
      lifeAreaId: mutation.lifeAreaId ?? null,
      kind: RoutineKind.HABIT,
      startTimeLocal: mutation.startTimeLocal,
      endTimeLocal: mutation.endTimeLocal,
      physicalLocation: mutation.physicalLocation ?? undefined,
      daysOfWeek: mutation.daysOfWeek,
    });
    revalidateAllOrbitViews();
    return {
      ok: true,
      confirmationMessage: `Confirmed: Created routine "${mutation.title}".`,
    };
  }

  if (mutation.mutationKind === "LOG_ACTIVITY") {
    await logExplicitActivityCheckIn(userId, {
      title: mutation.title,
      lifeAreaId: mutation.lifeAreaId ?? null,
      durationMinutes: mutation.durationMinutes,
    });
    revalidateAllOrbitViews();
    return {
      ok: true,
      confirmationMessage: `Confirmed: Logged ${mutation.durationMinutes} min for "${mutation.title}".`,
    };
  }

  // CREATE_TASK mutation
  let scheduledStart: Date | null = null;
  let scheduledEnd: Date | null = null;
  if (
    mutation.commitmentType === "SCHEDULED" &&
    mutation.targetDateStr &&
    mutation.targetTimeStr
  ) {
    const resolved = resolveLocalDateTimeToUtc(
      mutation.targetDateStr,
      mutation.targetTimeStr,
      ianaTimeZone
    );
    scheduledStart = resolved.instantUtc;
    const dur = mutation.estimatedMinutes ?? 60;
    scheduledEnd = new Date(scheduledStart.getTime() + dur * 60 * 1000);
  }

  await createStructuredTask(userId, {
    title: mutation.title,
    lifeAreaId: mutation.lifeAreaId,
    commitmentType: mutation.commitmentType as CommitmentType,
    priority: TaskPriority.NORMAL,
    estimatedMinutes: mutation.estimatedMinutes ?? 45,
    scheduledStart,
    scheduledEnd,
    flexibilityWindow: mutation.flexibilityWindow ?? "THIS_WEEK",
    waitingOnPerson: mutation.waitingOnPerson ?? null,
  });

  revalidateAllOrbitViews();
  return {
    ok: true,
    confirmationMessage: `Confirmed: Created "${mutation.title}" under ${mutation.lifeAreaName}.`,
  };
}

export async function transcribeAudioBase64Action(
  audioBase64: string,
  mimeType: string
): Promise<{ transcript: string; providerUsed: string }> {
  const userId = await requireUserId();

  const rateCheck = checkRateLimit(`${userId}:transcribe_audio`, 10, 60_000);
  if (!rateCheck.success) {
    throw new Error("Audio transcription rate limit reached. Please wait a minute before recording again.");
  }

  // Cap audio payload at ~15MB base64 string
  if (audioBase64.length > 20_000_000) {
    throw new Error("Audio recording is too large. Please record a shorter clip.");
  }

  return aiGateway.transcribeAudioNote(audioBase64, mimeType);
}

function pcmToWav(
  pcmBuffer: Buffer,
  sampleRate = 24000,
  numChannels = 1
): Buffer {
  const byteRate = sampleRate * numChannels * 2;
  const blockAlign = numChannels * 2;
  const wavHeader = Buffer.alloc(44);

  wavHeader.write("RIFF", 0);
  wavHeader.writeUInt32LE(36 + pcmBuffer.length, 4);
  wavHeader.write("WAVE", 8);
  wavHeader.write("fmt ", 12);
  wavHeader.writeUInt32LE(16, 16);
  wavHeader.writeUInt16LE(1, 20); // PCM
  wavHeader.writeUInt16LE(numChannels, 22);
  wavHeader.writeUInt32LE(sampleRate, 24);
  wavHeader.writeUInt32LE(byteRate, 28);
  wavHeader.writeUInt16LE(blockAlign, 32);
  wavHeader.writeUInt16LE(16, 34); // 16-bit
  wavHeader.write("data", 36);
  wavHeader.writeUInt32LE(pcmBuffer.length, 40);

  return Buffer.concat([wavHeader, pcmBuffer]);
}

export async function synthesizeGoogleSpeechAction(
  text: string
): Promise<{ audioBase64: string | null; mimeType: string | null }> {
  await requireUserId();
  let apiKey = (process.env.GEMINI_API_KEY ?? "").trim();
  if (apiKey.startsWith('"') && apiKey.endsWith('"')) {
    apiKey = apiKey.slice(1, -1).trim();
  }

  if (!apiKey) {
    return { audioBase64: null, mimeType: null };
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: `Please read aloud: ${text}`,
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: "Aoede",
            },
          },
        },
      },
    });

    const parts = response.candidates?.[0]?.content?.parts;
    const audioPart = parts?.find((p) => p.inlineData?.data);

    if (audioPart?.inlineData?.data) {
      const rawPcm = Buffer.from(audioPart.inlineData.data, "base64");
      const wav = pcmToWav(rawPcm, 24000, 1);
      return {
        audioBase64: wav.toString("base64"),
        mimeType: "audio/wav",
      };
    }
  } catch (err) {
    console.error("synthesizeGoogleSpeechAction error:", err);
  }

  return { audioBase64: null, mimeType: null };
}

// ============================================================================
// PHASE 4: PROACTIVE CHECK-INS, PREFERENCES, WEB PUSH & ROUTINE INTELLIGENCE
// ============================================================================

export async function respondToNotificationAction(formData: FormData) {
  const userId = await requireUserId();
  const notificationId = String(formData.get("notificationId") ?? "").trim();
  const responseValue = String(formData.get("responseValue") ?? "").trim();
  const responseNote = String(formData.get("responseNote") ?? "").trim() || null;
  const lifeAreaId = String(formData.get("lifeAreaId") ?? "").trim() || null;
  const durationMinutesRaw = parseInt(
    String(formData.get("durationMinutes") ?? "45"),
    10
  );

  if (!notificationId || !responseValue) return;

  await respondToNotification(userId, notificationId, {
    responseValue,
    responseNote,
    lifeAreaId,
    durationMinutes: Number.isNaN(durationMinutesRaw) ? 45 : durationMinutesRaw,
  });

  revalidateAllOrbitViews();
}

export async function updateUserPreferencesAction(formData: FormData) {
  const userId = await requireUserId();

  const ianaTimeZone =
    String(formData.get("ianaTimeZone") ?? "").trim() || "Africa/Lagos";
  const morningBriefingEnabled =
    formData.get("morningBriefingEnabled") === "on";
  const morningBriefingTime =
    String(formData.get("morningBriefingTime") ?? "").trim() || "07:30";
  const declaredWakeTime =
    String(formData.get("declaredWakeTime") ?? "").trim() || "07:00";
  const declaredSleepTime =
    String(formData.get("declaredSleepTime") ?? "").trim() || "23:00";
  const quietHoursEnabled = formData.get("quietHoursEnabled") === "on";
  const quietHoursStart =
    String(formData.get("quietHoursStart") ?? "").trim() || "22:00";
  const quietHoursEnd =
    String(formData.get("quietHoursEnd") ?? "").trim() || "07:00";

  const maxDailyRaw = parseInt(
    String(formData.get("maxDailyCheckIns") ?? "6"),
    10
  );
  const preReminderRaw = parseInt(
    String(formData.get("defaultPreTaskReminderMin") ?? "30"),
    10
  );
  const minGapRaw = parseInt(
    String(formData.get("minMinutesBetweenCheckIns") ?? "120"),
    10
  );

  const randomCheckInsEnabled =
    formData.get("randomCheckInsEnabled") === "on";
  const checkInFrequency =
    (formData.get("checkInFrequency") as CheckInFrequency) ||
    CheckInFrequency.BALANCED;

  await updateUserPreferences(userId, {
    ianaTimeZone,
    morningBriefingEnabled,
    morningBriefingTime,
    declaredWakeTime,
    declaredSleepTime,
    quietHoursEnabled,
    quietHoursStart,
    quietHoursEnd,
    maxDailyCheckIns: Number.isNaN(maxDailyRaw) ? 6 : maxDailyRaw,
    defaultPreTaskReminderMin: Number.isNaN(preReminderRaw)
      ? 30
      : preReminderRaw,
    randomCheckInsEnabled,
    checkInFrequency,
    minMinutesBetweenCheckIns: Number.isNaN(minGapRaw) ? 120 : minGapRaw,
  });

  revalidateAllOrbitViews();
}

export async function triggerProactiveCheckInAction(
  kind: "MORNING_BRIEFING" | "TASK_CHECKIN" | "RANDOM_CHECKIN"
): Promise<{ ok: boolean; notificationId?: string; message: string }> {
  const userId = await requireUserId();

  if (kind === "MORNING_BRIEFING") {
    const res = await generateMorningBriefingForUser(userId, new Date(), {
      force: true,
    });
    revalidateAllOrbitViews();
    return {
      ok: Boolean(res.notification),
      notificationId: res.notification?.id,
      message: res.notification
        ? "Morning briefing sent"
        : "Could not create briefing",
    };
  }

  if (kind === "TASK_CHECKIN") {
    const res = await generateTaskCheckInSample(userId, new Date());
    revalidateAllOrbitViews();
    return {
      ok: Boolean(res.notification),
      notificationId: res.notification?.id,
      message: res.notification
        ? "Task check-in sent"
        : "Could not create check-in",
    };
  }

  const res = await generateRandomActivityCheckIn(userId, new Date(), {
    force: true,
  });
  revalidateAllOrbitViews();
  return {
    ok: Boolean(res.notification),
    notificationId: res.notification?.id,
    message: res.notification
      ? "Activity check-in sent"
      : "Could not create check-in",
  };
}

export async function sendTestWebPushAction(): Promise<{
  attempted: number;
  delivered: number;
  deactivated: number;
}> {
  const userId = await requireUserId();
  const res = await sendPushToUserDevices(userId, {
    title: "Orbit push active",
    body: "Proactive check-ins will reach this device.",
    actionUrl: "/settings",
    tag: "orbit-push-test",
  });
  revalidatePath("/settings");
  return {
    attempted: res.attempted,
    delivered: res.delivered,
    deactivated: res.deactivated,
  };
}

export async function removePushSubscriptionAction(formData: FormData) {
  const userId = await requireUserId();
  const subscriptionId = String(formData.get("subscriptionId") ?? "").trim();
  if (!subscriptionId) return;

  await removeUserPushSubscription(userId, subscriptionId);
  revalidatePath("/settings");
}

export async function evaluateRoutinesNowAction(): Promise<{
  evaluatedActivities: number;
  createdCount: number;
}> {
  const userId = await requireUserId();
  const res = await evaluateUserRoutineIntelligence(userId);
  revalidateAllOrbitViews();
  return res;
}

export async function initializeNewUserWorkspaceAction(input?: {
  clientTimeZone?: string;
}) {
  const userId = await requireUserId();
  const timeZone = input?.clientTimeZone || "Africa/Lagos";

  await prisma.userPreference.upsert({
    where: { userId },
    update: { ianaTimeZone: timeZone },
    create: {
      userId,
      ianaTimeZone: timeZone,
      morningBriefingEnabled: true,
      morningBriefingTime: "07:30",
      declaredWakeTime: "07:00",
      declaredSleepTime: "23:00",
      quietHoursEnabled: true,
      quietHoursStart: "22:30",
      quietHoursEnd: "07:00",
      maxDailyCheckIns: 5,
      defaultPreTaskReminderMin: 30,
      randomCheckInsEnabled: true,
      checkInFrequency: "BALANCED",
      minMinutesBetweenCheckIns: 120,
    },
  });

  const existingAreas = await prisma.lifeArea.count({ where: { userId } });
  if (existingAreas === 0) {
    await prisma.lifeArea.createMany({
      data: [
        {
          userId,
          name: "Work",
          slug: "work",
          description: "Professional projects and career commitments",
          colorToken: "#2563eb",
          sortOrder: 0,
        },
        {
          userId,
          name: "Personal",
          slug: "personal",
          description: "Health, family, habits and personal growth",
          colorToken: "#059669",
          sortOrder: 1,
        },
      ],
    });
  }

  revalidateAllOrbitViews();
}

export interface QuickVoiceCommandResult {
  ok: boolean;
  intent: "TASK" | "ACTIVITY" | "NOTE" | "QUERY";
  title: string;
  summary: string;
  lifeAreaName?: string;
  planResponse?: ConversationalPlanResponse;
}

export async function processQuickVoiceCommandAction(
  spokenText: string
): Promise<QuickVoiceCommandResult> {
  const userId = await requireUserId();
  const trimmed = spokenText.trim();
  if (!trimmed) {
    throw new Error("No speech or command text provided.");
  }

  const rateCheck = checkRateLimit(`${userId}:voice_cmd`, 30, 60_000);
  if (!rateCheck.success) {
    throw new Error("Voice command rate limit exceeded. Please wait a moment.");
  }

  // Pattern A: Activity / Log work
  // e.g. "Log 45 minutes on backend API", "Log work: meeting with design team", "I worked on Orbit for 2 hours"
  const isExplicitActivity =
    /^(?:log(?:ged)?|record)\s+(?:work|activity|hours?|mins?|minutes?)\b/i.test(trimmed) ||
    /^(?:i\s+)?(?:worked\s+on|spent|finished\s+work\s+on)\b/i.test(trimmed);

  if (isExplicitActivity) {
    let durationMinutes = 45;
    const hourMatch = trimmed.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/i);
    const minMatch = trimmed.match(/(\d+)\s*(?:minutes?|mins?|m)\b/i);
    if (hourMatch && hourMatch[1]) {
      durationMinutes = Math.round(parseFloat(hourMatch[1]) * 60);
    } else if (minMatch && minMatch[1]) {
      durationMinutes = parseInt(minMatch[1], 10);
    }

    const cleaned = trimmed
      .replace(/^(?:log(?:ged)?|record)?\s*(?:work|activity)?\s*(?:on|for|:)?\s*/i, "")
      .replace(/^(?:i\s+)?(?:worked\s+on|spent|finished\s+work\s+on)\s*/i, "")
      .replace(/(?:for\s+)?\d+(?:\.\d+)?\s*(?:hours?|hrs?|minutes?|mins?)\s*(?:on\s+)?/i, "")
      .trim();

    const title = cleaned
      ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
      : "Work session";

    await logExplicitActivityCheckIn(userId, {
      title,
      durationMinutes,
    });

    revalidateAllOrbitViews();
    return {
      ok: true,
      intent: "ACTIVITY",
      title,
      summary: `Logged ${durationMinutes}m of work`,
    };
  }

  // Pattern B: Note / Memory Capture
  // e.g. "Take a note that Sarah agreed to send designs", "Note: client wants weekly check-ins", "Remember that..."
  const isExplicitNote =
    /^(?:take|save|write|capture)?\s*(?:a\s+)?(?:note|memo|thought|idea)\b/i.test(trimmed) ||
    /^(?:note\s+that|remember\s+that|keep\s+in\s+mind\s+that)\b/i.test(trimmed);

  if (isExplicitNote) {
    const cleaned = trimmed
      .replace(
        /^(?:take|save|write|capture)?\s*(?:a\s+)?(?:note|memo|thought|idea)?\s*(?:that|:|about)?\s*/i,
        ""
      )
      .trim();

    const noteContent = cleaned || trimmed;
    const firstLine = noteContent.split("\n")[0] ?? "Voice Note";
    const title = firstLine.slice(0, 60);

    await captureAndProcessMemoryEntry(userId, {
      title,
      rawContent: noteContent,
      captureKind: CaptureKind.VOICE_NOTE,
      consentConfirmed: true,
    });

    revalidateAllOrbitViews();
    return {
      ok: true,
      intent: "NOTE",
      title,
      summary: "Saved to Memory Inbox with action extraction",
    };
  }

  // Route all planning requests, questions, and task commands through the contextual planner
  // so Orbit matches Life Areas, asks for clarification when ambiguous, and lets the user confirm!
  const planRes = await askOrbitPlannerAction(trimmed);
  return {
    ok: true,
    intent: "QUERY",
    title: trimmed,
    summary: planRes.replyMarkdown,
    planResponse: planRes,
  };
}

export async function getRecentCheckInsAction(): Promise<{
  id: string;
  title: string;
  body: string;
  actionUrl: string;
  status: string;
  responseValue?: string | null;
  createdAt: string;
}[]> {
  const userId = await requireUserId();
  await evaluateDueBackgroundJobs({ userId, limit: 20 });

  const notifs = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 15,
  });

  return notifs.map((n) => ({
    id: n.id,
    title: n.title,
    body: n.body,
    actionUrl: n.actionUrl,
    status: n.status,
    responseValue: n.responseValue,
    createdAt: n.createdAt.toISOString(),
  }));
}

export async function syncAndCheckNotificationsAction(
  lastDeliveredIso?: string
): Promise<{
  unreadCount: number;
  newlyDelivered: Array<{
    id: string;
    title: string;
    body: string;
    actionUrl: string;
    createdAt: string;
  }>;
}> {
  const userId = await requireUserId();
  await evaluateDueBackgroundJobs({ userId, limit: 20 });

  const unreadCount = await prisma.notification.count({
    where: {
      userId,
      status: NotificationDeliveryStatus.DELIVERED,
      responseValue: null,
    },
  });

  const since = lastDeliveredIso
    ? new Date(lastDeliveredIso)
    : new Date(Date.now() - 35_000);

  const newlyDelivered = await prisma.notification.findMany({
    where: {
      userId,
      status: NotificationDeliveryStatus.DELIVERED,
      deliveredAt: { gt: since },
    },
    orderBy: { deliveredAt: "desc" },
    take: 3,
  });

  return {
    unreadCount,
    newlyDelivered: newlyDelivered.map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      actionUrl: n.actionUrl,
      createdAt: n.createdAt.toISOString(),
    })),
  };
}

export async function dismissNotificationAction(formData: FormData) {
  const userId = await requireUserId();
  const notificationId = String(formData.get("notificationId") ?? "").trim();
  if (!notificationId) return;

  await prisma.notification.updateMany({
    where: { id: notificationId, userId },
    data: {
      status: NotificationDeliveryStatus.DISMISSED,
      dismissedAt: new Date(),
    },
  });

  revalidateAllOrbitViews();
}


