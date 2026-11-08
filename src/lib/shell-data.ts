import { InboxProcessingStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

export async function getUnreviewedInboxActionCount(userId: string): Promise<number> {
  return prisma.extractedAction.count({
    where: {
      reviewStatus: "PENDING_REVIEW",
      inboxEntry: {
        userId,
        processingStatus: {
          in: [
            InboxProcessingStatus.RAW_UNPROCESSED,
            InboxProcessingStatus.EXTRACTED_PENDING_REVIEW,
          ],
        },
      },
    },
  });
}
