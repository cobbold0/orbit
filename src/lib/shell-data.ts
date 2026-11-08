import { InboxProcessingStatus, NotificationDeliveryStatus } from "@prisma/client";
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

export async function getUnreadCheckInCount(userId: string): Promise<number> {
  return prisma.notification.count({
    where: {
      userId,
      status: NotificationDeliveryStatus.DELIVERED,
    },
  });
}

export async function getShellBadgeCounts(userId: string): Promise<{
  unreviewedInboxCount: number;
  unreadCheckInCount: number;
}> {
  const [unreviewedInboxCount, unreadCheckInCount] = await Promise.all([
    getUnreviewedInboxActionCount(userId),
    getUnreadCheckInCount(userId),
  ]);
  return { unreviewedInboxCount, unreadCheckInCount };
}
