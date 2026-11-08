import {
  ActivitySource,
  CaptureKind,
  CommitmentType,
  ExtractedIntentClassification,
  ExtractedReviewStatus,
  InboxProcessingStatus,
  TaskPriority,
} from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { aiGateway } from "@/lib/ai/ai-provider";
import { retrieveUserOrbitContext } from "@/modules/ai/context-retriever";

export async function captureAndProcessMemoryEntry(
  userId: string,
  input: {
    title?: string | null;
    rawContent: string;
    captureKind: CaptureKind;
    speakerContext?: string | null;
    voiceDurationSec?: number | null;
    consentConfirmed?: boolean;
  }
) {
  const entry = await prisma.memoryInboxEntry.create({
    data: {
      userId,
      title: input.title?.trim() || null,
      rawContent: input.rawContent.trim(),
      captureKind: input.captureKind,
      speakerContext: input.speakerContext?.trim() || null,
      voiceDurationSec: input.voiceDurationSec ?? null,
      consentConfirmed: input.consentConfirmed ?? true,
      processingStatus: InboxProcessingStatus.PROCESSING,
    },
  });

  try {
    const userContext = await retrieveUserOrbitContext(userId);
    const extraction = await aiGateway.extractMemoryActions(
      entry.rawContent,
      entry.speakerContext,
      userContext
    );

    const defaultAreaId = userContext.lifeAreas[0]?.id ?? null;

    await prisma.$transaction(async (tx) => {
      for (const item of extraction.items) {
        const matchedArea = userContext.lifeAreas.find(
          (a) =>
            a.slug === item.suggestedLifeAreaSlug ||
            a.slug.startsWith(item.suggestedLifeAreaSlug ?? "")
        );
        const areaId = matchedArea?.id ?? defaultAreaId;

        await tx.extractedAction.create({
          data: {
            inboxEntryId: entry.id,
            lifeAreaId: areaId,
            projectId: item.suggestedProjectId || null,
            title: item.title,
            description: item.description ?? null,
            sourceQuote: item.sourceQuote,
            classification:
              item.classification as ExtractedIntentClassification,
            suggestedCommitment: item.suggestedCommitment as CommitmentType,
            waitingOnTarget: item.waitingOnTarget ?? null,
            confidenceScore: item.confidenceScore,
            reviewStatus: ExtractedReviewStatus.PENDING_REVIEW,
          },
        });
      }

      await tx.memoryInboxEntry.update({
        where: { id: entry.id },
        data: {
          title:
            entry.title ??
            (entry.speakerContext
              ? `Notes: ${entry.speakerContext}`
              : entry.rawContent.slice(0, 60)),
          aiSummary: extraction.summary,
          processingStatus: InboxProcessingStatus.EXTRACTED_PENDING_REVIEW,
        },
      });
    });
  } catch (err) {
    await prisma.memoryInboxEntry.update({
      where: { id: entry.id },
      data: {
        processingStatus: InboxProcessingStatus.RAW_UNPROCESSED,
        lastError: err instanceof Error ? err.message : "Extraction deferred",
      },
    });
  }

  return entry;
}

export async function reviewAndResolveExtractedAction(
  userId: string,
  extractedActionId: string,
  input: {
    decision: "APPROVE" | "DISMISS";
    overrideTitle?: string;
    overrideLifeAreaId?: string;
    overrideCommitmentType?: CommitmentType;
  }
) {
  const action = await prisma.extractedAction.findFirst({
    where: {
      id: extractedActionId,
      inboxEntry: { userId },
    },
    include: { inboxEntry: true },
  });

  if (!action) throw new Error("Extracted action not found");

  if (input.decision === "DISMISS") {
    await prisma.extractedAction.update({
      where: { id: action.id },
      data: {
        reviewStatus: ExtractedReviewStatus.DISMISSED,
        reviewedAt: new Date(),
      },
    });
    await syncInboxEntryReviewStatus(action.inboxEntryId);
    return;
  }

  const areas = await prisma.lifeArea.findMany({
    where: { userId, isArchived: false },
    orderBy: { sortOrder: "asc" },
  });
  const targetAreaId =
    input.overrideLifeAreaId || action.lifeAreaId || areas[0]?.id;
  if (!targetAreaId) throw new Error("Life Area required");

  const finalTitle = input.overrideTitle?.trim() || action.title;
  const finalCommitment =
    input.overrideCommitmentType ??
    (action.classification === ExtractedIntentClassification.FOLLOW_UP &&
    action.waitingOnTarget
      ? CommitmentType.WAITING
      : action.suggestedCommitment);

  await prisma.$transaction(async (tx) => {
    if (
      action.classification === ExtractedIntentClassification.ALREADY_COMPLETED
    ) {
      await tx.activityRecord.create({
        data: {
          userId,
          lifeAreaId: targetAreaId,
          projectId: action.projectId,
          title: finalTitle,
          description: `Confirmed from Memory Inbox: ${action.inboxEntry.title ?? ""}`,
          startedAt: new Date(),
          durationMinutes: 30,
          source: ActivitySource.USER_CONFIRMED,
          isConfirmed: true,
        },
      });

      await tx.extractedAction.update({
        where: { id: action.id },
        data: {
          reviewStatus: ExtractedReviewStatus.APPROVED,
          reviewedAt: new Date(),
        },
      });
    } else {
      const createdTask = await tx.task.create({
        data: {
          userId,
          lifeAreaId: targetAreaId,
          projectId: action.projectId,
          title: finalTitle,
          description: action.sourceQuote
            ? `From note: "${action.sourceQuote}"`
            : action.description,
          commitmentType: finalCommitment,
          priority:
            action.classification ===
            ExtractedIntentClassification.DEADLINE_MENTION
              ? TaskPriority.HIGH
              : TaskPriority.NORMAL,
          flexibilityWindow:
            finalCommitment === CommitmentType.FLEXIBLE ? "THIS_WEEK" : null,
          waitingOnPerson:
            finalCommitment === CommitmentType.WAITING
              ? (action.waitingOnTarget ?? "External contact")
              : null,
          waitingSince:
            finalCommitment === CommitmentType.WAITING ? new Date() : null,
        },
      });

      await tx.extractedAction.update({
        where: { id: action.id },
        data: {
          title: finalTitle,
          lifeAreaId: targetAreaId,
          suggestedCommitment: finalCommitment,
          materializedTaskId: createdTask.id,
          reviewStatus: ExtractedReviewStatus.APPROVED,
          reviewedAt: new Date(),
        },
      });
    }
  });

  await syncInboxEntryReviewStatus(action.inboxEntryId);
}

export async function approveAllActionableForEntry(
  userId: string,
  inboxEntryId: string
) {
  const entry = await prisma.memoryInboxEntry.findFirst({
    where: { id: inboxEntryId, userId },
    include: {
      extractedActions: {
        where: { reviewStatus: ExtractedReviewStatus.PENDING_REVIEW },
      },
    },
  });

  if (!entry) throw new Error("Inbox entry not found");

  const actionableTypes: ExtractedIntentClassification[] = [
    ExtractedIntentClassification.AGREED_TO_DO,
    ExtractedIntentClassification.ASSIGNED_TO_USER,
    ExtractedIntentClassification.FOLLOW_UP,
    ExtractedIntentClassification.DEADLINE_MENTION,
  ];

  for (const act of entry.extractedActions) {
    if (actionableTypes.includes(act.classification)) {
      await reviewAndResolveExtractedAction(userId, act.id, {
        decision: "APPROVE",
      });
    }
  }
}

async function syncInboxEntryReviewStatus(inboxEntryId: string) {
  const remainingActionable = await prisma.extractedAction.count({
    where: {
      inboxEntryId,
      reviewStatus: ExtractedReviewStatus.PENDING_REVIEW,
      classification: {
        in: [
          ExtractedIntentClassification.AGREED_TO_DO,
          ExtractedIntentClassification.ASSIGNED_TO_USER,
          ExtractedIntentClassification.FOLLOW_UP,
          ExtractedIntentClassification.DEADLINE_MENTION,
        ],
      },
    },
  });

  if (remainingActionable === 0) {
    await prisma.memoryInboxEntry.update({
      where: { id: inboxEntryId },
      data: {
        processingStatus: InboxProcessingStatus.REVIEWED,
        reviewedAt: new Date(),
      },
    });
  }
}
