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
});
