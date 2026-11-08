import { prisma } from "@/lib/db/prisma";
import { inngest } from "./client";
import {
  deliverTaskBackgroundJob,
  evaluateDueBackgroundJobs,
  generateMorningBriefingForUser,
  generateRandomActivityCheckIn,
} from "@/modules/notifications/notification-service";
import { flushPendingOutboxEvents } from "@/modules/outbox/outbox-service";
import { evaluateUserRoutineIntelligence } from "@/modules/routines/routine-intelligence";

export const taskCommitmentWorkflow = inngest.createFunction(
  {
    id: "task-commitment-workflow",
    cancelOn: [
      { event: "orbit/task.rescheduled", match: "data.taskId" },
      { event: "orbit/task.completed", match: "data.taskId" },
    ],
  },
  { event: "orbit/task.scheduled" },
  async ({ event, step }) => {
    const {
      preReminderJobId,
      startJobId,
      endJobId,
      scheduledStartIso,
      scheduledEndIso,
    } = event.data;

    if (preReminderJobId) {
      const preJob = await step.run("load-pre-reminder-time", async () => {
        const row = await prisma.backgroundJob.findUnique({
          where: { id: preReminderJobId },
          select: { scheduledFor: true },
        });
        return row?.scheduledFor.toISOString() ?? null;
      });

      if (preJob) {
        await step.sleepUntil("wait-for-pre-reminder", preJob);
        await step.run("deliver-pre-reminder", async () =>
          deliverTaskBackgroundJob(preReminderJobId)
        );
      }
    }

    if (startJobId) {
      await step.sleepUntil("wait-for-start-window", scheduledStartIso);
      await step.run("deliver-start-confirmation", async () =>
        deliverTaskBackgroundJob(startJobId)
      );
    }

    if (endJobId) {
      await step.sleepUntil("wait-for-end-window", scheduledEndIso);
      await step.run("deliver-end-confirmation", async () =>
        deliverTaskBackgroundJob(endJobId)
      );
    }
  }
);

export const morningBriefingCron = inngest.createFunction(
  { id: "morning-briefing-cron" },
  { cron: "*/15 * * * *" },
  async ({ step }) => {
    const users = await step.run("list-briefing-users", async () =>
      prisma.userPreference.findMany({
        where: { morningBriefingEnabled: true },
        select: { userId: true },
      })
    );

    let sent = 0;
    for (const u of users) {
      const res = await step.run(`briefing-${u.userId}`, async () =>
        generateMorningBriefingForUser(u.userId)
      );
      if (res.created) sent += 1;
    }

    return { checkedUsers: users.length, sent };
  }
);

export const randomActivityCheckInCron = inngest.createFunction(
  { id: "random-activity-checkin-cron" },
  { cron: "*/30 * * * *" },
  async ({ step }) => {
    const users = await step.run("list-random-checkin-users", async () =>
      prisma.userPreference.findMany({
        where: { randomCheckInsEnabled: true },
        select: { userId: true },
      })
    );

    let sent = 0;
    for (const u of users) {
      const res = await step.run(`random-checkin-${u.userId}`, async () =>
        generateRandomActivityCheckIn(u.userId)
      );
      if (res.created) sent += 1;
    }

    return { checkedUsers: users.length, sent };
  }
);

export const outboxAndDueJobsSweepCron = inngest.createFunction(
  { id: "outbox-and-due-jobs-sweeper" },
  { cron: "*/5 * * * *" },
  async ({ step }) => {
    const outboxResult = await step.run("flush-pending-outbox", async () =>
      flushPendingOutboxEvents({ limit: 50 })
    );
    const dueJobsResult = await step.run("evaluate-due-jobs", async () =>
      evaluateDueBackgroundJobs({ limit: 50 })
    );
    return { outboxResult, dueJobsResult };
  }
);

export const routineIntelligenceCron = inngest.createFunction(
  { id: "routine-intelligence-cron" },
  [{ cron: "0 21 * * *" }, { event: "orbit/routines.evaluate" }],
  async ({ event, step }) => {
    if (
      "data" in event &&
      event.data &&
      "userId" in event.data &&
      typeof event.data.userId === "string"
    ) {
      const targetUserId = event.data.userId;
      return step.run("evaluate-single-user-routines", async () =>
        evaluateUserRoutineIntelligence(targetUserId)
      );
    }

    const users = await step.run("list-all-users", async () =>
      prisma.user.findMany({ select: { id: true } })
    );

    let totalSuggestions = 0;
    for (const user of users) {
      const res = await step.run(`routines-${user.id}`, async () =>
        evaluateUserRoutineIntelligence(user.id)
      );
      totalSuggestions += res.createdCount;
    }

    return { usersEvaluated: users.length, totalSuggestions };
  }
);

export const orbitInngestFunctions = [
  taskCommitmentWorkflow,
  morningBriefingCron,
  randomActivityCheckInCron,
  outboxAndDueJobsSweepCron,
  routineIntelligenceCron,
];
