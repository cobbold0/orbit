import { describe, expect, it } from "vitest";
import {
  DeterministicFallbackProvider,
  resolveSupportedGeminiModel,
} from "./ai-provider";
import type { UserOrbitContext } from "@/modules/ai/context-retriever";

const sampleContext: UserOrbitContext = {
  userId: "user_1",
  ianaTimeZone: "Africa/Lagos",
  localDate: "2026-11-08", // Sunday
  localTimeHHmm: "14:00",
  isoDayOfWeek: 7,
  todaySchedule: {
    dayName: "Sunday",
    dateStr: "2026-11-08",
    isoDayOfWeek: 7,
    routinesAndLocations: [],
    scheduledTasks: [
      {
        title: "Refine Basilissa attendance dashboard exception filters",
        lifeAreaName: "Basilissa",
        startTime: "09:00",
        endTime: "10:00",
      },
    ],
  },
  tomorrowSchedule: {
    dayName: "Monday",
    dateStr: "2026-11-09",
    isoDayOfWeek: 1,
    routinesAndLocations: [
      {
        title: "Engineering Office Shift",
        kind: "WORK_BLOCK",
        physicalLocation: "Basilissa Tech Hub, Accra",
        startTime: "09:00",
        endTime: "17:00",
        lifeAreaName: "Basilissa",
      },
    ],
    scheduledTasks: [],
  },
  userPreferences: {
    declaredWakeTime: "07:30",
    declaredSleepTime: "23:00",
    quietHoursEnabled: true,
    quietHoursStart: "22:00",
    quietHoursEnd: "07:00",
    checkInFrequency: "BALANCED",
    maxDailyCheckIns: 3,
    defaultPreTaskReminderMin: 30,
  },
  lifeAreas: [
    {
      id: "area_basilissa",
      name: "Basilissa",
      slug: "basilissa",
      description: "Engineering & Mon-Tue office",
    },
    {
      id: "area_everlyx",
      name: "Everlyx",
      slug: "everlyx",
      description: "Wed-Sat office",
    },
    {
      id: "area_music",
      name: "Music",
      slug: "music",
      description: "Music production",
    },
  ],
  activeProjects: [
    {
      id: "proj_attendance",
      title: "Build Attendance Management System",
      kind: "PROJECT",
      lifeAreaId: "area_basilissa",
      lifeAreaSlug: "basilissa",
      lifeAreaName: "Basilissa",
    },
  ],
  openTasks: [
    {
      id: "task_dashboard",
      title: "Refine Basilissa attendance dashboard exception filters",
      commitmentType: "SCHEDULED",
      status: "NEEDS_CHECKIN",
      lifeAreaId: "area_basilissa",
      lifeAreaName: "Basilissa",
      lifeAreaSlug: "basilissa",
      projectId: "proj_attendance",
      projectTitle: "Build Attendance Management System",
      scheduledStartIso: "2026-11-08T09:00:00.000Z",
      scheduledEndIso: "2026-11-08T10:00:00.000Z",
      dueDateIso: null,
      estimatedMinutes: 60,
      flexibilityWindow: null,
      waitingOnPerson: null,
    },
  ],
  declaredRoutines: [],
  recentConfirmedActivities: [],
};

describe("AI Provider & Memory Extraction Engine", () => {
  it("normalizes mistyped gemini-3.5-flash-lite model string to gemini-2.5-flash", () => {
    expect(resolveSupportedGeminiModel("gemini-3.5-flash-lite")).toBe(
      "gemini-2.5-flash"
    );
    expect(resolveSupportedGeminiModel("gemini-2.5-pro")).toBe(
      "gemini-2.5-pro"
    );
  });

  it("distinguishes commitments from casual mentions and completed items in CEO meeting notes", async () => {
    const provider = new DeterministicFallbackProvider();
    const rawNote =
      "Spoke with the CEO this morning. We agreed I will improve the attendance dashboard summary view. Contact the Odoo developer about the attendance APIs. He also casually mentioned they might explore a cafeteria kiosk next year. Noted that the initial server provisioning is already completed.";

    const result = await provider.extractMemoryActions(
      rawNote,
      "Basilissa CEO",
      sampleContext
    );

    expect(result.items.length).toBeGreaterThanOrEqual(4);

    const classes = result.items.map((i) => i.classification);
    expect(classes).toContain("AGREED_TO_DO");
    expect(classes).toContain("FOLLOW_UP");
    expect(classes).toContain("MENTIONED_ONLY");
    expect(classes).toContain("ALREADY_COMPLETED");
  });

  it("prepares a confirmation-required reschedule proposal when user says 'I didn't finish the attendance dashboard today. Move it to Friday afternoon.'", async () => {
    const provider = new DeterministicFallbackProvider();
    const plan = await provider.planWithContext(
      "I didn't finish the attendance dashboard today. Move it to Friday afternoon.",
      sampleContext
    );

    expect(plan.proposedMutations).toHaveLength(1);
    const mutation = plan.proposedMutations[0]!;
    expect(mutation.mutationKind).toBe("RESCHEDULE_TASK");
    if (mutation.mutationKind === "RESCHEDULE_TASK") {
      expect(mutation.taskId).toBe("task_dashboard");
      // Next Friday after Sunday 2026-11-08 is 2026-11-13
      expect(mutation.targetDateStr).toBe("2026-11-13");
      expect(mutation.targetTimeStr).toBe("14:00");
    }
  });

  it("proposes an UPDATE_PREFERENCE mutation when user asks to shift sleeping time", async () => {
    const provider = new DeterministicFallbackProvider();
    const plan = await provider.planWithContext(
      "Shift my sleeping time to 11:30 pm",
      sampleContext
    );

    expect(plan.proposedMutations).toHaveLength(1);
    const mutation = plan.proposedMutations[0]!;
    expect(mutation.mutationKind).toBe("UPDATE_PREFERENCE");
    if (mutation.mutationKind === "UPDATE_PREFERENCE") {
      expect(mutation.declaredSleepTime).toBe("23:30");
      expect(mutation.explanation).toContain("23:30");
    }
  });

  it("proposes a COMPLETE_TASK mutation when user says they finished a task", async () => {
    const provider = new DeterministicFallbackProvider();
    const plan = await provider.planWithContext(
      "I finished the attendance dashboard task",
      sampleContext
    );

    expect(plan.proposedMutations).toHaveLength(1);
    const mutation = plan.proposedMutations[0]!;
    expect(mutation.mutationKind).toBe("COMPLETE_TASK");
    if (mutation.mutationKind === "COMPLETE_TASK") {
      expect(mutation.taskId).toBe("task_dashboard");
      expect(mutation.taskTitle).toBe(
        "Refine Basilissa attendance dashboard exception filters"
      );
    }
  });

  it("asks for clarification instead of blindly creating when given an unknown entity like KFC", async () => {
    const provider = new DeterministicFallbackProvider();
    const plan = await provider.planWithContext(
      "Create a task for KFC",
      sampleContext
    );

    expect(plan.proposedMutations).toHaveLength(0);
    expect(plan.replyMarkdown).toContain("KFC");
    expect(plan.replyMarkdown).toContain("Which Life Area");
  });

  it("answers where the user has to be tomorrow based on declared routines and physical locations", async () => {
    const provider = new DeterministicFallbackProvider();
    const plan = await provider.planWithContext(
      "Where am I going tomorrow?",
      sampleContext
    );

    expect(plan.replyMarkdown).toContain("Basilissa Tech Hub, Accra");
    expect(plan.replyMarkdown).toContain("Engineering Office Shift");
    expect(plan.replyMarkdown).toContain("09:00 to 17:00");
  });

  it("answers what the user has on their schedule tomorrow", async () => {
    const provider = new DeterministicFallbackProvider();
    const plan = await provider.planWithContext(
      "What do I have tomorrow?",
      sampleContext
    );

    expect(plan.replyMarkdown).toContain("Engineering Office Shift");
    expect(plan.replyMarkdown).toContain("Basilissa Tech Hub, Accra");
  });
});
