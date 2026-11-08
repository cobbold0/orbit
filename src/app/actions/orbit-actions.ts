"use server";

import { revalidatePath } from "next/cache";
import {
  CaptureKind,
  CommitmentType,
  ProjectKind,
  ScheduleChangeReason,
  TaskPriority,
} from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import {
  confirmTaskCompletion,
  createStructuredTask,
  createTaskWithQuickCapture,
  markTaskStarted,
  rescheduleOrChangeCommitment,
} from "@/modules/tasks/task-service";
import {
  addMilestoneToProject,
  createLifeArea,
  createProjectOrJourney,
  cycleMilestoneStatus,
  updateLifeArea,
} from "@/modules/life-areas/life-area-service";
import {
  logExplicitActivityCheckIn,
  resolveInferredActivity,
  resolveSuggestedRoutine,
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

function revalidateAllOrbitViews() {
  revalidatePath("/");
  revalidatePath("/timeline");
  revalidatePath("/areas");
  revalidatePath("/routines");
  revalidatePath("/inbox");
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
  } else if (recoveryKind === "TOMORROW_AFTERNOON") {
    const pref = await prisma.userPreference.findUnique({ where: { userId } });
    const ianaTimeZone = pref?.ianaTimeZone ?? "Africa/Lagos";
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const yyyy = tomorrow.getUTCFullYear();
    const mm = String(tomorrow.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(tomorrow.getUTCDate()).padStart(2, "0");
    const resolved = resolveLocalDateTimeToUtc(
      `${yyyy}-${mm}-${dd}`,
      "14:00",
      ianaTimeZone
    );
    const dur = task.estimatedMinutes ?? 60;
    const newEnd = new Date(resolved.instantUtc.getTime() + dur * 60 * 1000);

    await rescheduleOrChangeCommitment(userId, taskId, {
      newCommitmentType: CommitmentType.SCHEDULED,
      newStart: resolved.instantUtc,
      newEnd,
      reason: ScheduleChangeReason.USER_RESCHEDULED,
      note: "Moved to tomorrow afternoon",
    });
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
  if (!name) return;

  await createLifeArea(userId, { name, description, colorToken });
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
  } else if (operation === "RENAME") {
    const name = String(formData.get("name") ?? "").trim();
    if (name) {
      await updateLifeArea(userId, areaId, { name });
    }
  }

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
  const context = await retrieveUserOrbitContext(userId);
  return aiGateway.planWithContext(userMessage, context);
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
  await requireUserId();
  return aiGateway.transcribeAudioNote(audioBase64, mimeType);
}

