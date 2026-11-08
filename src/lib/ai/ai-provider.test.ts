import { describe, expect, it } from "vitest";
import {
  DeterministicFallbackProvider,
  resolveSupportedGeminiModel,
} from "./ai-provider";
import type { UserOrbitContext } from "@/modules/ai/context-retriever";

const sampleContext: UserOrbitContext = {
  userId: "user_1",
  userName: "Alex",
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
  upcomingWeekSchedule: [],
  queriedDateSchedule: null,
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
      milestones: [
        {
          id: "m_1",
          title: "API Integrations",
          status: "PENDING",
          sortOrder: 0,
        },
      ],
    },
  ],
  openTasks: [
    {
      id: "task_dashboard",
      title: "Refine Basilissa attendance dashboard exception filters",
      commitmentType: "SCHEDULED",
      status: "NEEDS_CHECKIN",
      priority: "NORMAL",
      notes: "Review logs carefully",
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
  completedTasksToday: [],
  recentCompletedTasks: [],
  recentInboxNotes: [],
  pendingCheckIns: [],
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

  it("answers queries for arbitrary future dates using queriedDateSchedule", async () => {
    const provider = new DeterministicFallbackProvider();
    const contextWithQueriedDate: UserOrbitContext = {
      ...sampleContext,
      queriedDateSchedule: {
        queryDateStr: "2026-12-24",
        dayName: "Thursday",
        isPast: false,
        isFuture: true,
        routinesAndLocations: [
          {
            title: "Holiday Preparation",
            kind: "FLEXIBLE_HABIT",
            physicalLocation: "City Mall",
            startTime: "14:00",
            endTime: "16:00",
            lifeAreaName: "Personal",
          },
        ],
        scheduledTasks: [
          {
            title: "Pick up family gifts",
            lifeAreaName: "Personal",
            startTime: "16:30",
            endTime: "17:30",
          },
        ],
        pastActivities: [],
        completedTasks: [],
      },
    };

    const plan = await provider.planWithContext(
      "What will happen on the 24th December?",
      contextWithQueriedDate
    );

    expect(plan.replyMarkdown).toContain("Thursday, 2026-12-24");
    expect(plan.replyMarkdown).toContain("Holiday Preparation");
    expect(plan.replyMarkdown).toContain("City Mall");
    expect(plan.replyMarkdown).toContain("Pick up family gifts");
  });

  it("answers queries for historical past dates using queriedDateSchedule", async () => {
    const provider = new DeterministicFallbackProvider();
    const contextWithPastDate: UserOrbitContext = {
      ...sampleContext,
      queriedDateSchedule: {
        queryDateStr: "2024-01-01",
        dayName: "Monday",
        isPast: true,
        isFuture: false,
        routinesAndLocations: [],
        scheduledTasks: [],
        pastActivities: [
          {
            title: "New Year Annual Planning Session",
            durationMinutes: 120,
            lifeAreaName: "Personal",
            startedAtIso: "2024-01-01T10:00:00.000Z",
          },
        ],
        completedTasks: [
          {
            title: "Draft 2024 Strategic Roadmap",
            lifeAreaName: "Basilissa",
            completedAtIso: "2024-01-01T16:00:00.000Z",
          },
        ],
      },
    };

    const plan = await provider.planWithContext(
      "What did I do on January 1st, 2024?",
      contextWithPastDate
    );

    expect(plan.replyMarkdown).toContain("Monday, 2024-01-01");
    expect(plan.replyMarkdown).toContain("New Year Annual Planning Session");
    expect(plan.replyMarkdown).toContain("Draft 2024 Strategic Roadmap");
  });

  it("answers queries about project milestones", async () => {
    const provider = new DeterministicFallbackProvider();
    const plan = await provider.planWithContext(
      "What are the milestones for Build Attendance Management System?",
      sampleContext
    );

    expect(plan.replyMarkdown).toContain("Build Attendance Management System");
    expect(plan.replyMarkdown).toContain("API Integrations");
    expect(plan.replyMarkdown).toContain("Next milestone to tackle");
  });

  it("answers queries about daily accomplishments", async () => {
    const provider = new DeterministicFallbackProvider();
    const contextWithAccomplishments: UserOrbitContext = {
      ...sampleContext,
      completedTasksToday: [
        {
          id: "task_done_1",
          title: "Ship Odoo attendance webhooks",
          lifeAreaName: "Basilissa",
          completedAtIso: "2026-11-08T12:00:00.000Z",
        },
      ],
    };

    const plan = await provider.planWithContext(
      "What did I accomplish today?",
      contextWithAccomplishments
    );

    expect(plan.replyMarkdown).toContain("Ship Odoo attendance webhooks");
    expect(plan.replyMarkdown).toContain("accomplished today");
  });

  it("answers queries about captured notes and thoughts", async () => {
    const provider = new DeterministicFallbackProvider();
    const contextWithNotes: UserOrbitContext = {
      ...sampleContext,
      recentInboxNotes: [
        {
          id: "note_1",
          title: "Architecture idea",
          summary: "Use Temporal for offline-first sync engine",
          rawSnippet: "Temporal offline sync",
          createdAtIso: "2026-11-08T11:00:00.000Z",
        },
      ],
    };

    const plan = await provider.planWithContext(
      "What did I note recently?",
      contextWithNotes
    );

    expect(plan.replyMarkdown).toContain("Use Temporal for offline-first sync engine");
    expect(plan.replyMarkdown).toContain("Architecture idea");
  });
});
